import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { corsJson, requireAuth } from "./_auth";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
  if (event.httpMethod !== "GET")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

  const auth = await requireAuth(event);
  if (!auth.ok) return { statusCode: auth.statusCode, headers: corsJson, body: JSON.stringify({ error: auth.error }) };

  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "NEON_DATABASE_URL missing" }) };
  const sql = neon(dbUrl);

  const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit || 50), 1), 200);
  const offset = Math.max(Number(event.queryStringParameters?.offset || 0), 0);
  const onlyNeedsReview = (event.queryStringParameters?.needs_review || "").toLowerCase() in { "1": 1, "true": 1, "yes": 1 };

  const rows = await sql`
    SELECT
      l.request_id, l.created_at, l.source, l.mode, l.accept, l.pred_label,
      l.p_human, l.p_ai, l.p_mt, l.risk, l.teacher_uncertainty,
      f.verdict, f.true_label, f.comment
    FROM inference_log l
    LEFT JOIN teacher_feedback f ON f.request_id = l.request_id
    WHERE l.user_id = ${auth.user.id}
      AND (${onlyNeedsReview}::boolean = false OR (f.request_id IS NULL OR f.verdict = 'unsure'))
    ORDER BY l.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return { statusCode: 200, headers: corsJson, body: JSON.stringify({ rows }) };
};

