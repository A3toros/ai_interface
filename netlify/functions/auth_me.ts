import type { Handler } from "@netlify/functions";
import { corsJson, requireAuth } from "./_auth";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
  if (event.httpMethod !== "GET")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

  const auth = await requireAuth(event);
  if (!auth.ok) return { statusCode: auth.statusCode, headers: corsJson, body: JSON.stringify({ error: auth.error }) };

  return { statusCode: 200, headers: corsJson, body: JSON.stringify({ ok: true, user: auth.user }) };
};

