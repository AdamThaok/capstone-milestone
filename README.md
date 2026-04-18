# Capstone Milestone — OPM to Code

AI-agent web app that turns **Object-Process Methodology (OPM) diagrams** into
a runnable full-stack application (React + FastAPI + Firebase Firestore).

**Status**: skeleton + UI complete, pipeline mocked, real LLM integration
pending (needs API keys).

- **Production**: https://capstone-milestone-alpha.vercel.app
- **Repo**: https://github.com/AdamThaok/capstone-milestone
- **Supabase dashboard**: https://supabase.com/dashboard/project/wugaaayaylumcylsjhyk
- **Vercel dashboard**: https://vercel.com/adams-projects-06d6a83a/capstone-milestone
- **Working dir**: `E:\milestonewebsite` (Windows)
- **Auth**: demo-only — `admin` / `admin`

---

## AI AGENT HANDOFF PROMPT

Paste this whole section to another Claude/Copilot session to pick up work.

### Project identity

- Capstone Project Phase A-61998 (ORT Braude College, Software Engineering)
- Authors: Kamel Dokhan, Adam Tehaok
- Supervisor: Natali Levi
- Title: *From OPM to Code: An AI Agent for Model–Code Consistency*
- Architecture doc on disk: `C:\Users\x\Desktop\cheats\cap\Capstone project Adam and Kamel_final fixes.docx`

### What the app does

User uploads an OPM diagram (XML / JSON / OPX / PNG / JPG). An AI agent
runs a 6-stage pipeline that emits a complete runnable React + FastAPI +
Firebase project with traceability from every OPM element to its
generated code artifact.

### Pipeline (per activity diagram in architecture doc)

```
0. Validate Input Format & Completeness
   ↓ (fork)
1a. Parse OPM Elements       1b. Retrieve ISO 19450 Rules (RAG / Pinecone)
   ↓ (join)
2. Semantic Analysis & Blueprint (Gemini + ChatGPT)
   ↓
3. Full-Stack Code Generation (Claude)
   ↓
4. Automated Validation + Refinement Loop
   ↓
5. Package & Deliver (ZIP + traceability report)
```

Error path: if stage 0 fails → emit error, abort, mark downstream stages
as error.

### Stack

- **Frontend + orchestrator**: Next.js 16.2.3 (app router), React 19.2.5,
  TypeScript 5
- **Auth**: cookie-based session (hardcoded `admin`/`admin` via
  `DEMO_USERNAME`/`DEMO_PASSWORD`). Supabase configured but not used yet.
- **Generated output stack** (emitted from pipeline): React + Vite +
  FastAPI + Firestore + Docker Compose
- **Deploy**: Vercel Hobby, auto-deploys from GitHub `main`

### File layout

```
app/
  page.tsx                         # landing
  login/page.tsx                   # username/password form
  api/login/route.ts               # checks admin/admin, sets session cookie
  api/logout/route.ts              # clears session cookie
  api/generate/route.ts            # POST: persist upload to tmp, start job
  api/generate/[id]/route.ts       # GET: job state (polled every 500ms)
  api/generate/[id]/download/      # GET: zip stream (or placeholder txt)
  dashboard/page.tsx               # server component, auth guard
  dashboard/dashboard-client.tsx   # drop-zone, stage progress, trace, DL
  globals.css                      # styling
  layout.tsx                       # root layout

lib/pipeline/
  types.ts                         # JobState, StageResult, StageId union
  jobs.ts                          # in-memory Map<id, JobState>, createJob()
  runner.ts                        # orchestrator: fork/join, timeout+retry
  stage0-validate.ts               # ext + non-empty check
  stage1-parse.ts                  # picks mock variant by filename hash
  stage2-spec.ts                   # loads mock system_spec.json
  stage3-rag.ts                    # loads mock super_prompt.txt
  stage4-codegen.ts                # loads mock file_tree.json
  stage5-validate.ts               # loads mock validation_report.json

public/mock-outputs/
  opm_model.json                   # default parse variant (orders)
  opm_model_simple.json            # variant: todo app
  opm_model_complex.json           # variant: clinic/appointment system
  system_spec.json                 # mock stage 2 output
  super_prompt.txt                 # mock stage 3 output (RAG + prompt)
  file_tree.json                   # mock stage 4 output (generated tree)
  validation_report.json           # mock stage 5 output (checks + trace map)
  generated-project.zip            # real 28-file React+FastAPI+Firebase
                                   # scaffold served on download

proxy.ts                           # middleware: redirect unauthed /dashboard
tsconfig.json                      # @/ alias = repo root
.env.example                       # DEMO_* + Supabase + LLM + Firebase keys
```

### What's real vs mock (as of commit 134ca3c)

| Component                            | Real | Mock |
|--------------------------------------|------|------|
| Dashboard UI, drag-drop, stage view  | ✓    |      |
| Login + session cookie               | ✓    |      |
| File upload → tmp persistence (10MB cap) | ✓ |      |
| Job state machine + polling          | ✓    |      |
| Stage orchestration (fork / join)    | ✓    |      |
| Timeout (60s) + retry (2×) wrappers  | ✓    |      |
| Error propagation (stuck→error)      | ✓    |      |
| Download zip (static scaffold)       | ✓    |      |
| Stage 0 validation                   | partial (ext + size) |  |
| Stages 1–5 outputs                   |      | load JSON from disk |
| Refinement loop                      |      | iterations: 2 hardcoded, no real loop |
| Pinecone RAG                         |      | no index, mock chunks |
| Claude/Gemini/GPT-4o calls           |      | not wired |

### Credentials (shared out-of-band — paste into `.env.local`, gitignored)

Supabase project URL is `https://wugaaayaylumcylsjhyk.supabase.co`.
Anon + service-role keys shared via Discord/Signal (never committed).
Ask Adam for the values.

```
NEXT_PUBLIC_SUPABASE_URL=https://wugaaayaylumcylsjhyk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask>
SUPABASE_SERVICE_ROLE_KEY=<ask>
DEMO_USERNAME=admin
DEMO_PASSWORD=admin
# LLM keys (blank = mock mode)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=iso-19450-v1
# Firebase (only for generated-project runtime, not for this Next app)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

### Bootstrap (fresh machine)

```bash
git clone https://github.com/AdamThaok/capstone-milestone.git milestonewebsite
cd milestonewebsite
cp .env.example .env.local
# fill in keys shown above
npm install
npm run dev
# → http://localhost:3000  (login admin/admin)
```

### To finish (swap mocks → real LLMs)

Order of work when API keys arrive:

1. **Stage 1 (GPT-4o vision)** — read uploaded file, call
   `openai.chat.completions` with vision, parse response → real
   `opm_model.json`. ~80 LOC.
2. **Stage 2 (Gemini)** — send opm_model → get system_spec. ~60 LOC.
3. **Stage 3 (Pinecone RAG)** — one-time: embed ISO 19450 PDF → upsert
   to Pinecone index. Runtime: query top-k for opm_model terms, inject
   into prompt. ~100 LOC + index setup script.
4. **Stage 4 (Claude)** — send super_prompt → receive code files →
   write to tmp dir. ~120 LOC.
5. **Stage 5 (real validator + loop)** — `docker compose build` in
   subprocess, check coverage of OPM ids in emitted code, if fidelity
   fails call stage 4 again with corrective prompt. Loop max 3×. ~150 LOC.
6. **Download** — zip real generated-project dir instead of static
   `public/mock-outputs/generated-project.zip`. ~30 LOC.

No runner or API changes needed — all swaps go inside `lib/pipeline/stage*.ts`.

### Cost estimate per real generation

- GPT-4o vision: $0.02
- Gemini: $0.01
- Claude Sonnet 4.6: $0.30–0.80
- Pinecone: free tier
- **Total**: $0.35–1.00 per run
- **Timing**: 1–4 min end-to-end

### Conventions

- TypeScript strict, no `any`
- Server Components default, `"use client"` only when needed
- API routes in `app/api/*/route.ts`
- Cookie check on every protected page (see `app/dashboard/page.tsx`)
- Styles via `globals.css` class names

### Don'ts

- Don't commit `.env.local`
- Don't run destructive Supabase ops without asking — shared with
  grader-accessible deployment
- Don't rewrite the staged UI without asking — the visual pipeline is
  intentional for demo-day grading
- Don't push to `main` without verifying `npx tsc --noEmit` is clean —
  Vercel auto-deploys

### Reference material

- Activity diagram, use case diagram, architecture diagram: embedded in
  the capstone .docx (extractable via `unzip word/media/`)
- ISO 19450:2015 is the OPM standard the RAG layer retrieves from
- Architecture diagram lists 8 modules: Client / Orchestrator / Parser /
  Meta-Model / Prompt Composer / Code Gen / Validator / Packager —
  currently mapped to dashboard / runner.ts / stage1 / stage2 / stage3 /
  stage4 / stage5 / download route

### Git state

- Branch: `main`
- Latest commits (newest first):
  - `134ca3c` — Pre-LLM prep: file persistence, retry/timeout, mock variants
  - `e9f6b29` — Align pipeline to activity diagram: validation + fork/join
  - `9b3c080` — Add 5-stage pipeline with mock outputs + downloadable scaffold
  - `54725ae` — Add dashboard UI with upload, pipeline stages, traceability
  - `1a70fe8` — Initial scaffold

---

## Quick reference for humans

### Run locally
```bash
npm install
npm run dev
# http://localhost:3000
# login: admin / admin
```

### Deploy
Push to `main`. Vercel auto-deploys in ~90s.

### Test pipeline
Upload any .xml/.json/.opx/.png/.jpg. Watch 6 stages progress.
Click completed stages to expand their JSON output.
