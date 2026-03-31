import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { corsJson, requireAuth } from "./_auth";

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

async function callGradioPredict(baseUrl: string, text: string): Promise<any> {
  const url = baseUrl.replace(/\/+$/, "");
  const apiName = (process.env.AI_DETECTOR_GRADIO_API_NAME || "/predict_json").replace(/^\/+/, "");
  const post = await fetch(`${url}/call/${apiName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: [text] }),
  });
  if (!post.ok) {
    const t = await post.text();
    throw new Error(`HF call failed: ${post.status} ${t}`);
  }
  const created = await post.json();
  const eventId = created?.event_id;
  if (!eventId) throw new Error("HF response missing event_id");

  // Poll until complete.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const r = await fetch(`${url}/call/${apiName}/${eventId}`, { method: "GET" });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`HF poll failed: ${r.status} ${t}`);
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
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

  const auth = await requireAuth(event);
  if (!auth.ok) return { statusCode: auth.statusCode, headers: corsJson, body: JSON.stringify({ error: auth.error }) };

  const dbUrl = process.env.NEON_DATABASE_URL;
  const hfBase = (process.env.AI_DETECTOR_HF_SPACE_URL || "").trim();
  if (!dbUrl) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "NEON_DATABASE_URL missing" }) };
  if (!hfBase)
    return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "AI_DETECTOR_HF_SPACE_URL missing" }) };

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

  const hf = await callGradioPredict(hfBase, text);
  const rawResult = hf?.result;
  const parsed = extractFieldsFromAiDetectorRaw(rawResult);

  if (!parsed) {
    // Store raw only if we can't parse; still keep request_id for audit.
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO inference_log (request_id, user_id, source, mode, accept, pred_label, p_human, p_ai, p_mt, raw_json)
      VALUES (${requestId}, ${auth.user.id}, ${body.source || "ai_interface"}, ${body.mode || null}, ${false}, ${"unknown"}, ${0}, ${0}, ${0}, ${JSON.stringify({ hf, rawResult })}::jsonb)
      ON CONFLICT (request_id) DO UPDATE SET raw_json = EXCLUDED.raw_json
    `;
    return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok: true, request_id: requestId, raw: rawResult }) };
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
};

