## ai_interface plan (Netlify + Neon + Vite + TypeScript)

Goal: a simple web app for reviewing AI-detector outputs, storing them in Neon, and collecting teacher feedback.

### Stack

- **Frontend**: Vite + React + TypeScript (Netlify-hosted)
- **Backend**: Netlify Functions (TypeScript)
- **DB**: Neon Postgres
- **Secrets**: Netlify env var **`NEON_DATABASE_URL`** (server-side only)

### Data model (Neon)

Single table (inferences + teacher review) for easy analysis.

#### `inference_log`

One row per model run.

- `request_id` (text, primary key) — client-generated UUID
- `created_at` (timestamptz, default now())
- `source` (text) — e.g. `"ai_detector_space"`, `"local"`, `"api"`
- `mode` (text) — e.g. `"essay"` / `"transcript"`
- `accept` (bool)
- `pred_label` (text) — `"human" | "ai" | "mt"`
- `p_human` / `p_ai` / `p_mt` (real)
- `risk` (real)
- `teacher_uncertainty` (real)
- `tau_risk` / `tau_unc` / `critic_margin` (real)
- `model_ref` (text) — e.g. Space commit hash or model version
- `text_hash` (text, nullable) — optional privacy-preserving linkage (no raw text by default)
- `notes` (text, nullable)

Teacher review fields live on `inference_log`:

- `teacher_verdict` — `"correct" | "incorrect" | "unsure"`
- `teacher_true_label` — `"human" | "ai" | "mt"` (optional)
- `teacher_comment` (optional)
- `teacher_user_id` (who reviewed)
- `teacher_reviewed_at` (when reviewed)

### API surface (Netlify Functions)

All DB access must be server-side; the browser never sees `NEON_DATABASE_URL`.

- **`POST /.netlify/functions/log_inference`**
  - body: the inference record (including `request_id`)
  - action: insert into `inference_log` (upsert by `request_id`)

- **`POST /.netlify/functions/submit_feedback`**
  - body: `{ request_id, verdict, true_label?, comment? }`
  - action: update `inference_log.teacher_*`

- **`GET /.netlify/functions/list_inferences?limit=50&offset=0&filter=...`**
  - action: list recent inferences for UI table

### UI (Vite + TS)

Pages/components (minimal):

- **Recent runs table**
  - columns: time, request_id, accept/abstain, top label, %s, risk, uncertainty, feedback status
  - filters: accept only / abstain only / “needs review”

- **Detail drawer**
  - shows the 3-class %s, risk gates, thresholds used
  - feedback form (Correct / Incorrect / Unsure + optional true label)

### Auth (v2 minimal)

Start with a single shared password gate or Netlify Identity; keep it simple.
If you skip auth initially, do not expose DB-write endpoints publicly.

### Repo layout (proposed)

- `ai_interface/` (this folder): web app source
  - `ai_interface/web/` (Vite app)
  - `ai_interface/netlify/functions/` (TS functions)
  - `ai_interface/netlify.toml` (build + functions config)

### Environment variables

Netlify site env:

- **`NEON_DATABASE_URL`**: Postgres connection string (Neon pooled endpoint recommended)

Optional:

- `APP_ENV=prod|dev`
- `LOG_TEXT=false` (default false; if true, store encrypted text instead of hash)

### Next implementation steps

1. Scaffold Vite + React + TS in `ai_interface/web/`.
2. Add Netlify Functions with a small DB client (node-postgres).
3. Create Neon schema + minimal migration SQL.
4. Wire UI → functions → Neon; verify end-to-end logging + feedback.

