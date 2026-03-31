import { useState } from "react";
import { motion } from "framer-motion";
import { authLogin } from "./api";

export default function LoginPage(props: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authLogin({ username, password });
      props.onLoggedIn();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-futuristic-radial">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-3xl border border-slate-200/60 bg-white/70 p-8 shadow-glow backdrop-blur"
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-100 via-sky-100 to-emerald-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Secure review console
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-900">AI Interface</h1>
              <p className="mt-2 text-sm text-slate-600">
                Sign in to review runs and label outcomes. Default seed is <b>admin/admin</b> (change immediately).
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="text-xs font-semibold text-slate-700">Username</div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-slate-700">Password</div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200/60 transition hover:brightness-105 disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

