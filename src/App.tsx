import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { analyzeAndLog, authMe, submitFeedback, uuidv4, type AnalyseResult } from "./api";
import LoginPage from "./LoginPage";

function pct(x: number) {
  return `${(x * 100).toFixed(2)}%`;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export default function App() {
  const nav = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  const [text, setText] = useState("");
  const [mode, setMode] = useState<"essay" | "transcript">("essay");

  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [raw, setRaw] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackSentFor, setFeedbackSentFor] = useState<string | null>(null);

  const nonHumanMass = useMemo(() => {
    if (!result) return 0;
    return clamp01(result.p_ai + result.p_mt);
  }, [result]);

  useEffect(() => {
    (async () => {
      try {
        await authMe();
        setIsAuthed(true);
      } catch {
        setIsAuthed(false);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  async function onAnalyze() {
    setBusy(true);
    setError(null);
    setResult(null);
    setRaw(null);
    setFeedbackSentFor(null);

    const request_id = uuidv4();
    setCurrentRequestId(request_id);

    try {
      const resp = await analyzeAndLog({
        request_id,
        text,
        mode,
        source: "ai_interface_web",
      });
      setRaw(resp.raw ?? null);
      setResult(resp.result ?? null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onFeedback(verdict: "correct" | "incorrect" | "unsure") {
    if (!currentRequestId) return;
    if (!result) return; // buttons hidden, but keep safe
    setFeedbackBusy(true);
    setError(null);
    try {
      await submitFeedback({ request_id: currentRequestId, verdict });
      setFeedbackSentFor(currentRequestId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setFeedbackBusy(false);
    }
  }

  const showFeedbackButtons = Boolean(result && currentRequestId);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-futuristic-radial">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-glow backdrop-blur">
            Checking session…
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthed ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage
              onLoggedIn={() => {
                setIsAuthed(true);
                nav("/", { replace: true });
              }}
            />
          )
        }
      />
      <Route path="/*" element={isAuthed ? <AppAuthed /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

function AppAuthed() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"essay" | "transcript">("essay");

  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [raw, setRaw] = useState<unknown>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackSentFor, setFeedbackSentFor] = useState<string | null>(null);
  const [feedbackTrueLabel, setFeedbackTrueLabel] = useState<"human" | "ai" | "mt" | "ai_mimic_human" | "">("");
  const [feedbackComment, setFeedbackComment] = useState("");

  const nonHumanMass = useMemo(() => {
    if (!result) return 0;
    return clamp01(result.p_ai + result.p_mt);
  }, [result]);

  async function onAnalyze() {
    setBusy(true);
    setError(null);
    setResult(null);
    setRaw(null);
    setFeedbackSentFor(null);
    setFeedbackTrueLabel("");
    setFeedbackComment("");

    const request_id = uuidv4();
    setCurrentRequestId(request_id);

    try {
      const resp = await analyzeAndLog({
        request_id,
        text,
        mode,
        source: "ai_interface_web",
      });
      setRaw(resp.raw ?? null);
      setResult(resp.result ?? null);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function onFeedback(verdict: "correct" | "incorrect" | "unsure") {
    if (!currentRequestId) return;
    if (!result) return;

    if (verdict === "incorrect" && !feedbackTrueLabel) {
      setError("When marking Incorrect, please select the true label (human / ai / mt / ai mimicking human).");
      return;
    }

    setFeedbackBusy(true);
    setError(null);
    try {
      await submitFeedback({
        request_id: currentRequestId,
        verdict,
        true_label:
          verdict === "incorrect"
            ? (feedbackTrueLabel as "human" | "ai" | "mt" | "ai_mimic_human")
            : null,
        comment: feedbackComment.trim() ? feedbackComment.trim() : null,
      });
      setFeedbackSentFor(currentRequestId);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setFeedbackBusy(false);
    }
  }

  const showFeedbackButtons = Boolean(result && currentRequestId);

  return (
    <div className="min-h-screen bg-futuristic-radial">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-6"
        >
          <header className="rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-glow backdrop-blur">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-100 via-sky-100 to-emerald-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  V2 feedback loop console
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">AI Detector Review</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Analyze via backend → HF Space API, log to Neon, then label outcomes on the same{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5">request_id</code>.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Mode
                </span>
                <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <input type="radio" checked={mode === "essay"} onChange={() => setMode("essay")} disabled={busy} />
                  Essay
                </label>
                <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <input
                    type="radio"
                    checked={mode === "transcript"}
                    onChange={() => setMode("transcript")}
                    disabled={busy}
                  />
                  Transcript
                </label>
              </div>
            </div>
          </header>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-glow backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">Input</h2>
                <button
                  onClick={onAnalyze}
                  disabled={busy || !text.trim()}
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200/60 transition hover:brightness-105 disabled:opacity-60"
                >
                  {busy ? "Analyzing…" : "Analyze + Log"}
                </button>
              </div>

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste text here…"
                className="mt-3 min-h-[400px] w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />

              {currentRequestId ? (
                <div className="mt-3 text-xs text-slate-600">
                  Current request:{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{currentRequestId}</code>
                </div>
              ) : null}

              {error ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-glow backdrop-blur">
              <h2 className="text-sm font-bold text-slate-900">Result</h2>
              {!result ? (
                <div className="mt-3 min-h-[600px] rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  Run an analysis to see probabilities and decision gates.
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 space-y-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">Decision</div>
                      <div className="mt-1 text-2xl font-black tracking-tight text-slate-900">
                        {result.accept ? "ACCEPT" : "ABSTAIN"}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Top label: <b className="text-slate-900">{result.pred_label.toUpperCase()}</b> · Non-human mass{" "}
                        <b className="text-slate-900">{pct(nonHumanMass)}</b>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        risk {result.risk?.toFixed(3) ?? "—"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        unc {result.teacher_uncertainty?.toFixed(3) ?? "—"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        τrisk {result.tau_risk?.toFixed(3) ?? "—"}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { k: "Human", v: result.p_human, c: "from-indigo-500 to-sky-500" },
                      { k: "AI", v: result.p_ai, c: "from-fuchsia-500 to-rose-500" },
                      { k: "MT", v: result.p_mt, c: "from-emerald-500 to-lime-500" },
                    ].map((x) => (
                      <div key={x.k} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold text-slate-600">{x.k}</div>
                        <div className="mt-1 text-xl font-black text-slate-900">{pct(x.v)}</div>
                        <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full bg-gradient-to-r ${x.c}`}
                            style={{ width: `${clamp01(x.v) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {showFeedbackButtons ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-sm font-bold text-slate-900">Teacher feedback</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Click once. This updates the same row (same{" "}
                        <code className="rounded bg-slate-100 px-1.5 py-0.5">request_id</code>). Next analysis creates a new
                        row.
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <div className="text-xs font-semibold text-slate-700">True label (required if Incorrect)</div>
                          <select
                            value={feedbackTrueLabel}
                            onChange={(e) => setFeedbackTrueLabel(e.target.value as any)}
                            disabled={feedbackBusy || feedbackSentFor === currentRequestId}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                          >
                            <option value="">(select)</option>
                            <option value="human">human</option>
                            <option value="ai">ai</option>
                            <option value="mt">mt</option>
                            <option value="ai_mimic_human">ai mimicking human</option>
                          </select>
                        </label>
                        <label className="block">
                          <div className="text-xs font-semibold text-slate-700">Comment (optional)</div>
                          <input
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            disabled={feedbackBusy || feedbackSentFor === currentRequestId}
                            placeholder="Why was it wrong? Any notes…"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                          />
                        </label>
                      </div>

                      {feedbackSentFor === currentRequestId ? (
                        <div className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Saved
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => onFeedback("correct")}
                            disabled={feedbackBusy}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60"
                          >
                            Correct
                          </button>
                          <button
                            onClick={() => onFeedback("incorrect")}
                            disabled={feedbackBusy}
                            className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60"
                          >
                            Incorrect
                          </button>
                          <button
                            onClick={() => onFeedback("unsure")}
                            disabled={feedbackBusy}
                            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-105 disabled:opacity-60"
                          >
                            Not sure
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <details className="rounded-2xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">Raw</summary>
                    <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap text-xs text-slate-800">
                      {JSON.stringify(raw ?? result, null, 2)}
                    </pre>
                  </details>
                </motion.div>
              )}
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}

