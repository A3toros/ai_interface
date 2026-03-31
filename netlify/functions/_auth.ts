import { neon } from "@neondatabase/serverless";
import * as jwt from "jsonwebtoken";

export type AuthUser = {
  id: string;
  email?: string;
  username?: string;
  role?: string;
};

export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; statusCode: number; error: string };

export function extractBearerToken(headers: Record<string, string | undefined> | undefined): string | null {
  const h = headers?.authorization || headers?.Authorization;
  if (!h) return null;
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  return null;
}

export function extractCookie(cookies: string, name: string): string | null {
  for (const part of cookies.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v || null;
  }
  return null;
}

export async function requireAuth(event: { headers?: Record<string, string | undefined> }): Promise<AuthResult> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return { ok: false, statusCode: 500, error: "JWT_SECRET not configured" };

  const token =
    extractBearerToken(event.headers) ||
    extractCookie(event.headers?.cookie || event.headers?.Cookie || "", "access_token");

  if (!token) return { ok: false, statusCode: 401, error: "Authentication required" };

  let decoded: any;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    return { ok: false, statusCode: 401, error: "Invalid or expired token" };
  }

  // Validate the user exists in Neon.
  const dbUrl = process.env.NEON_DATABASE_URL;
  if (!dbUrl) return { ok: false, statusCode: 500, error: "NEON_DATABASE_URL not configured" };
  const sql = neon(dbUrl);

  const rows = await sql`
    SELECT id, username, email, role
    FROM ai_interface_users
    WHERE id = ${decoded.userId}
  `;
  if (!rows?.length) return { ok: false, statusCode: 401, error: "User not found" };

  const u = rows[0] as any;
  return {
    ok: true,
    user: {
      id: u.id,
      username: u.username ?? undefined,
      email: u.email ?? undefined,
      role: u.role ?? undefined,
    },
  };
}

export const corsJson = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

