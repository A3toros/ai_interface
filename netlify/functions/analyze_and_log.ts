import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { corsJson, requireAuth } from "./_auth";
import { Client } from "@gradio/client";

type AnalyseRequest = {
  request_id: string;
  text: string;
  mode?: "essay" | "transcript" | string;
  source?: string;
  model_ref?: string;
  text_hash?: string;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function normalizeApiName(name: string): string {
  const s = (name || "").trim();
  if (!s) return "/predict_json";
  return s.startsWith("/") ? s : `/${s}`;
}

async function callGradioPredictViaClient(spaceOrUrl: string, apiName: string, text: string): Promise<any> {
  const client = await Client.connect(spaceOrUrl);
  // For a single Textbox input, gradio client expects an object keyed by the component name.
  const r: any = await client.predict(apiName, { text });
  return r;
}

async function listNamedEndpoints(spaceOrUrl: string): Promise<string[]> {
  const client = await Client.connect(spaceOrUrl);
  const api: any = await (client as any).view_api?.();
  const named = api?.named_endpoints;
  if (!named || typeof named !== "object") return [];
  return Object.keys(named).sort();
}

async function callGradioPredictViaHttp(baseUrl: string, text: string): Promise<any> {
  const url = baseUrl.replace(/\/+$/, "");
  const apiName = normalizeApiName(process.env.AI_DETECTOR_GRADIO_API_NAME || "/predict_json").replace(/^\/+/, "");
  const endpoint = `${url}/call/${apiName}`;
  const post = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [text] }),
  });
  if (!post.ok) {
    const t = await post.text().catch(() => "");
    const snippet = (t || "").slice(0, 800);
    throw new Error(
      `HF call failed: ${post.status} at ${endpoint}` + (snippet ? `\n\n${snippet}` : "")
    );
  }
  const created = await post.json();
  const eventId = created?.event_id;
  if (!eventId) throw new Error("HF response missing event_id");

  // Poll until complete.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const pollUrl = `${url}/call/${apiName}/${eventId}`;
    const r = await fetch(pollUrl, { method: "GET" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      const snippet = (t || "").slice(0, 800);
      throw new Error(
        `HF poll failed: ${r.status} at ${pollUrl}` + (snippet ? `\n\n${snippet}` : "")
      );
    }
    const txt = await r.text();
    // Gradio returns SSE-ish text; final payload is usually on a line starting with "data:".
    const lines = txt.split(/\r?\n/).filter(Boolean);
    const dataLines = lines.filter((l) => l.startsWith("data:"));
    if (dataLines.length) {
      const last = dataLines[dataLines.length - 1].slice(5).trim();
      try {
        const parsed = JSON.parse(last);
        // Our ai_detector returns markdown string. Prefer returning raw.
        return { event_id: eventId, result: parsed };
      } catch {
        // Keep polling unless we also see "event: complete"
      }
    }
    if (/\bevent:\s*complete\b/i.test(txt)) {
      return { event_id: eventId, result: txt };
    }
    await sleep(750);
  }
  throw new Error("HF poll timed out");
}

function extractFieldsFromAiDetectorRaw(raw: any) {
  // Gradio often wraps single output as a 1-element array.
  if (Array.isArray(raw) && raw.length === 1) raw = raw[0];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const probs = raw.probs || {};
  return {
    accept: Boolean(raw.accept),
    pred_label: String(raw.pred_label || ""),
    p_human: Number(probs.human ?? 0),
    p_ai: Number(probs.ai ?? 0),
    p_mt: Number(probs.mt ?? 0),
    risk: raw.risk == null ? null : Number(raw.risk),
    teacher_uncertainty: raw.teacher_uncertainty == null ? null : Number(raw.teacher_uncertainty),
    margin_top1_top2: raw.margin_top1_top2 == null ? null : Number(raw.margin_top1_top2),
    tau_risk: raw.thresholds?.tau_risk == null ? null : Number(raw.thresholds.tau_risk),
    tau_unc: raw.thresholds?.tau_unc == null ? null : Number(raw.thresholds.tau_unc),
    critic_margin: raw.thresholds?.critic_margin == null ? null : Number(raw.thresholds.critic_margin),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
    if (event.httpMethod !== "POST")
      return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

    const auth = await requireAuth(event);
    if (!auth.ok) return { statusCode: auth.statusCode, headers: corsJson, body: JSON.stringify({ error: auth.error }) };

    const dbUrl = process.env.NEON_DATABASE_URL;
    const hfBase = (process.env.AI_DETECTOR_HF_SPACE_URL || "").trim();
    const spaceId = (process.env.AI_DETECTOR_HF_SPACE_ID || "").trim();
    if (!dbUrl) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "NEON_DATABASE_URL missing" }) };
    if (!hfBase && !spaceId)
      return {
        statusCode: 500,
        headers: corsJson,
        body: JSON.stringify({ error: "Set AI_DETECTOR_HF_SPACE_ID (recommended) or AI_DETECTOR_HF_SPACE_URL" }),
      };
    if (/huggingface\.co\/spaces\//i.test(hfBase)) {
      return {
        statusCode: 500,
        headers: corsJson,
        body: JSON.stringify({
          error:
            "AI_DETECTOR_HF_SPACE_URL must be the running Space host (https://<space>.hf.space), not the Hub page (huggingface.co/spaces/...).",
        }),
      };
    }
    if (!/^https?:\/\//i.test(hfBase)) {
      if (hfBase) {
        return {
          statusCode: 500,
          headers: corsJson,
          body: JSON.stringify({ error: "AI_DETECTOR_HF_SPACE_URL must start with http(s)://" }),
        };
      }
    }

    let body: AnalyseRequest;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "Invalid JSON" }) };
    }
    const requestId = (body.request_id || "").trim();
    const text = (body.text || "").trim();
    if (!requestId) return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "request_id required" }) };
    if (!text) return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "text required" }) };

    const configuredApiName = normalizeApiName(process.env.AI_DETECTOR_GRADIO_API_NAME || "/predict_json");
    const target = spaceId || hfBase;
    const candidates = Array.from(
      new Set([
        configuredApiName,
        "/predict_json",
        "/predict",
        "/analyse_essay",
        "/analyse_transcript",
        "/analyze_essay",
        "/analyze_transcript",
      ])
    );

    let hf: any = null;
    let lastErr: any = null;

    // Prefer @gradio/client (works across Gradio versions). Try a few likely endpoints.
    for (const apiName of candidates) {
      try {
        hf = await callGradioPredictViaClient(target, apiName, text);
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message || e);
        // If the endpoint doesn't exist, try next candidate; otherwise break and fallback to HTTP.
        if (/no endpoint matching/i.test(msg) || /fn_index/i.test(msg)) continue;
        break;
      }
    }

    if (!hf) {
      // Fallback: legacy direct HTTP /call/* protocol (Gradio 4 style).
      if (hfBase) {
        try {
          hf = await callGradioPredictViaHttp(hfBase, text);
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!hf) {
      let endpoints: string[] = [];
      try {
        endpoints = await listNamedEndpoints(target);
      } catch {
        // ignore
      }
      return {
        statusCode: 502,
        headers: corsJson,
        body: JSON.stringify({
          error: "HF/Gradio call failed",
          detail: String(lastErr?.message || lastErr || "unknown"),
          configured_api_name: configuredApiName,
          tried_api_names: candidates,
          available_named_endpoints: endpoints,
          hint:
            "Set AI_DETECTOR_GRADIO_API_NAME to one of available_named_endpoints (e.g. /analyse_essay) or redeploy Space exposing /predict_json.",
        }),
      };
    }

    // Normalize possible shapes:
    // - client.predict returns { data: [...] }
    // - our /call endpoint helper returns { result: ... }
    const rawResult = (hf && typeof hf === "object" && "data" in hf ? (hf as any).data : (hf as any)?.result) ?? hf;
    const parsed = extractFieldsFromAiDetectorRaw(rawResult);

    if (!parsed) {
      // Store raw only if we can't parse; still keep request_id for audit.
      const sql = neon(dbUrl);
      await sql`
        INSERT INTO inference_log (request_id, user_id, source, mode, accept, pred_label, p_human, p_ai, p_mt, raw_json)
        VALUES (${requestId}, ${auth.user.id}, ${body.source || "ai_interface"}, ${body.mode || null}, ${false}, ${"unknown"}, ${0}, ${0}, ${0}, ${JSON.stringify({ hf, rawResult })}::jsonb)
        ON CONFLICT (request_id) DO UPDATE SET raw_json = EXCLUDED.raw_json
      `;
      return {
        statusCode: 200,
        headers: corsJson,
        body: JSON.stringify({ ok: true, request_id: requestId, raw: rawResult }),
      };
    }

    const sql = neon(dbUrl);
    await sql`
      INSERT INTO inference_log (
        request_id, user_id, source, mode,
        accept, pred_label, p_human, p_ai, p_mt,
        risk, teacher_uncertainty, margin_top1_top2,
        tau_risk, tau_unc, critic_margin,
        model_ref, text_hash, raw_json
      )
      VALUES (
        ${requestId}, ${auth.user.id}, ${body.source || "ai_interface"}, ${body.mode || null},
        ${parsed.accept}, ${parsed.pred_label}, ${parsed.p_human}, ${parsed.p_ai}, ${parsed.p_mt},
        ${parsed.risk}, ${parsed.teacher_uncertainty}, ${parsed.margin_top1_top2},
        ${parsed.tau_risk}, ${parsed.tau_unc}, ${parsed.critic_margin},
        ${body.model_ref || null}, ${body.text_hash || null}, ${JSON.stringify(rawResult)}::jsonb
      )
      ON CONFLICT (request_id) DO UPDATE SET
        accept = EXCLUDED.accept,
        pred_label = EXCLUDED.pred_label,
        p_human = EXCLUDED.p_human,
        p_ai = EXCLUDED.p_ai,
        p_mt = EXCLUDED.p_mt,
        risk = EXCLUDED.risk,
        teacher_uncertainty = EXCLUDED.teacher_uncertainty,
        margin_top1_top2 = EXCLUDED.margin_top1_top2,
        tau_risk = EXCLUDED.tau_risk,
        tau_unc = EXCLUDED.tau_unc,
        critic_margin = EXCLUDED.critic_margin,
        model_ref = EXCLUDED.model_ref,
        text_hash = EXCLUDED.text_hash,
        raw_json = EXCLUDED.raw_json
    `;

    return {
      statusCode: 200,
      headers: corsJson,
      body: JSON.stringify({ ok: true, request_id: requestId, result: parsed, raw: rawResult }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: corsJson,
      body: JSON.stringify({ error: "analyze_and_log crashed", detail: String(e?.message || e) }),
    };
  }
};

