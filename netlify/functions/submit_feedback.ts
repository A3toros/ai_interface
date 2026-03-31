import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { corsJson, requireAuth } from "./_auth";

type Body = {
  request_id: string;
  verdict: "correct" | "incorrect" | "unsure";
  true_label?: "human" | "ai" | "mt" | null;
  comment?: string | null;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

  const auth = await requireAuth(event);
  if (!auth.ok) return { statusCode: auth.statusCode, headers: corsJson, body: JSON.stringify({ error: auth.error }) };

  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "NEON_DATABASE_URL missing" }) };
  const sql = neon(dbUrl);

  let body: Body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  const requestId = (body.request_id || "").trim();
  const verdict = body.verdict;
  if (!requestId) return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "request_id required" }) };
  if (!verdict) return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "verdict required" }) };

  const updated = await sql`
    UPDATE inference_log
    SET
      teacher_verdict = ${verdict},
      teacher_true_label = ${body.true_label || null},
      teacher_comment = ${body.comment || null},
      teacher_user_id = ${auth.user.id},
      teacher_reviewed_at = now()
    WHERE request_id = ${requestId}
      AND user_id = ${auth.user.id}
    RETURNING request_id
  `;

  if (!updated || updated.length === 0) {
    return { statusCode: 404, headers: corsJson, body: JSON.stringify({ error: "request_id not found" }) };
  }

  return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok: true }) };
};

