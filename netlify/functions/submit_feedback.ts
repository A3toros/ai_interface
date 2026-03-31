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

  await sql`
    INSERT INTO teacher_feedback (request_id, user_id, verdict, true_label, comment)
    VALUES (${requestId}, ${auth.user.id}, ${verdict}, ${body.true_label || null}, ${body.comment || null})
    ON CONFLICT (request_id) DO UPDATE SET
      verdict = EXCLUDED.verdict,
      true_label = EXCLUDED.true_label,
      comment = EXCLUDED.comment,
      created_at = now()
  `;

  return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok: true }) };
};

