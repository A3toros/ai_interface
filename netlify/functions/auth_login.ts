import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import * as jwt from "jsonwebtoken";
import { corsJson } from "./_auth";

type Body = { username: string; password: string };

function cookie(name: string, value: string) {
  // Netlify Functions: no domain; secure in prod; lax is OK for same-site.
  const secure = (process.env.APP_ENV || "").toLowerCase() === "prod" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsJson, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers: corsJson, body: JSON.stringify({ error: "Method not allowed" }) };

  const jwtSecret = process.env.JWT_SECRET;
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!jwtSecret) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "JWT_SECRET missing" }) };
  if (!dbUrl) return { statusCode: 500, headers: corsJson, body: JSON.stringify({ error: "NEON_DATABASE_URL missing" }) };

  let body: Body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "Invalid JSON" }) };
  }
  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  if (!username || !password)
    return { statusCode: 400, headers: corsJson, body: JSON.stringify({ error: "username and password required" }) };

  const sql = neon(dbUrl);
  const rows = await sql`
    SELECT id, username, email, role
    FROM ai_interface_users
    WHERE username = ${username}
      AND password_hash = crypt(${password}, password_hash)
    LIMIT 1
  `;
  if (!rows?.length)
    return { statusCode: 401, headers: corsJson, body: JSON.stringify({ error: "Invalid credentials" }) };

  const u = rows[0] as any;
  const token = jwt.sign(
    { userId: u.id, role: u.role, username: u.username, email: u.email },
    jwtSecret,
    { expiresIn: "14d" }
  );

  return {
    statusCode: 200,
    headers: { ...corsJson, "Set-Cookie": cookie("access_token", token) },
    body: JSON.stringify({
      ok: true,
      user: { id: u.id, username: u.username, email: u.email ?? null, role: u.role },
    }),
  };
};

