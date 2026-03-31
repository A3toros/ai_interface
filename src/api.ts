export type AnalyseResult = {
  accept: boolean;
  pred_label: string;
  p_human: number;
  p_ai: number;
  p_mt: number;
  risk: number | null;
  teacher_uncertainty: number | null;
  margin_top1_top2: number | null;
  tau_risk: number | null;
  tau_unc: number | null;
  critic_margin: number | null;
};

export type AnalyseAndLogResponse = {
  ok: true;
  request_id: string;
  result?: AnalyseResult;
  raw?: unknown;
};

export async function analyzeAndLog(params: {
  request_id: string;
  text: string;
  mode?: string;
  source?: string;
  model_ref?: string;
  text_hash?: string;
}): Promise<AnalyseAndLogResponse> {
  const r = await fetch("/api/analyze_and_log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as AnalyseAndLogResponse;
}

export async function authMe(): Promise<{ ok: true; user: { id: string; username?: string; role?: string } }> {
  const r = await fetch("/api/auth_me", { method: "GET", credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as any;
}

export async function authLogin(params: { username: string; password: string }): Promise<{ ok: true }> {
  const r = await fetch("/api/auth_login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as any;
}

export async function submitFeedback(params: {
  request_id: string;
  verdict: "correct" | "incorrect" | "unsure";
  true_label?: "human" | "ai" | "mt" | "ai_mimic_human" | null;
  comment?: string | null;
}): Promise<{ ok: true }> {
  const r = await fetch("/api/submit_feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as { ok: true };
}

export function uuidv4(): string {
  if ("randomUUID" in crypto) return (crypto as any).randomUUID();
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  const hex = [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

