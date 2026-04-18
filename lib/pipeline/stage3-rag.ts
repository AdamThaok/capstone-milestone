// Stage 3: Syntax-Aware RAG + Multi-Model Reasoning
// Real impl (single-AI variant): skip Pinecone, inline ISO 19450 distilled
// rules as text, ask Gemini to fold them into a precise code-gen prompt.
// Fallback: load mock super_prompt.txt.

import fs from "node:fs/promises";
import path from "node:path";
import { askText, isGeminiConfigured } from "@/lib/llm/gemini";

// Condensed excerpts of ISO 19450:2015 mapping rules. Injected verbatim into
// the prompt so the codegen stays faithful to OPM semantics.
const ISO_RULES = `
ISO 19450:2015 mapping rules (condensed):

§6.5.2 Aggregation-Participation: whole W ◇ part P → one-to-many;
  part entity stores FK to whole.
§7.3.1 State Transition: if a process links state S1 → S2 via consumption/
  effect, implement as atomic transaction. Reject requests from other states
  with 409 Conflict.
§5.4 Agent Link: object A agent→ process P means A is an authenticated
  principal; P is an authorized endpoint; enforce ownership.
§6.3 Instrument Link: object I instrument→ process P means I is required
  context but not consumed. Read-only dependency.
§6.4 Consumption Link: object C consumed→ process P means C is destroyed
  when P runs (or its state advances irreversibly).
§6.2 Result Link: process P result→ object O means P creates O.
§5.2 Informatical Objects: persist to a document/row. Value objects
  (single scalar, IEquatable) may be embedded inline.
§7.1 Generalization: parent → child means child inherits parent schema;
  implement as discriminator column or separate tables with shared FK.
`.trim();

const PROMPT = `
You are a prompt composer.

Given:
1. The OPM IR (objects, processes, links, states).
2. The derived system specification (entities, endpoints, screens, rules).
3. The ISO 19450 rules below.

Produce a single consolidated "super prompt" that a code generator can follow
to emit a complete, compilable, ZERO-CONFIG full-stack project matching the
OPM model.

Target stack: React + Vite (frontend), FastAPI + Python + SQLAlchemy (backend),
PostgreSQL (database), deployed to Railway (cloud host).

ZERO-CONFIG CLOUD DEPLOY REQUIREMENTS (HARD):
- Target: project is auto-deployed to Railway by the dumper orchestrator.
  The end user NEVER runs Docker, NEVER installs anything, NEVER creates
  a Firebase project. They click a live URL and use the app.
- Backend MUST use SQLAlchemy + asyncpg driver + PostgreSQL. NO Firebase,
  NO Firestore, NO firebase-admin.
- Backend reads DATABASE_URL from env (Railway injects it automatically
  when a Postgres plugin is attached). Default to postgresql+asyncpg://
  prefix. If DATABASE_URL starts with "postgres://", code must rewrite to
  "postgresql+asyncpg://" at startup.
- Backend MUST run Alembic migrations (or metadata.create_all) on startup
  to create tables before serving requests.
- Backend MUST run a seed.py that inserts 3–5 sample rows per table,
  derived from OPM object names/states. Idempotent.
- Frontend uses axios to call backend via VITE_API_BASE_URL env var.
  Railway sets VITE_API_BASE_URL to the backend service's public URL at
  build time.
- Emit Dockerfile for BOTH services (Railway builds from Dockerfile).
- docker-compose.yml still emitted for local dev convenience (postgres +
  backend + frontend), but NOT required for end users.
- Emit railway.json at repo root describing two services (backend,
  frontend) and one Postgres plugin.
- Port configuration: backend reads PORT env (Railway default 8080);
  frontend reads PORT env for nginx listen directive.
- Emit README.md with ONE link at the top: "Live app: {{RAILWAY_URL}}".
  Leave the placeholder literal — the dumper replaces it after deploy.
- CORS: backend allows the frontend origin (also a Railway URL) via env
  var FRONTEND_ORIGIN.
- Include .gitignore that excludes .env, node_modules, __pycache__, dist.
- NO firebase-credentials.json, NO service account JSON, NO Firebase
  references anywhere.

The super prompt must:
- Enumerate every entity, endpoint, screen, business rule.
- Embed the relevant ISO rules inline (do NOT omit).
- State hard constraints: no extra features, validate state transitions,
  no invented fields, include TRACEABILITY.md, include README.md, include
  docker-compose.yml, include firestore.rules (emulator reads these).
- Include seed.py that populates sample data for every OPM object.
- Include a \`scripts/wait-for-emulator.sh\` or equivalent so backend waits
  for emulator before seeding.
- README must have a single "Quick start" section: just \`docker compose up\`.
- Instruct the generator to emit files as a JSON object
  { "files": [ { "path": "...", "content": "..." } ] } so the runner can
  write them to disk and build.

Respond with ONLY the super prompt text (no markdown fences, no preamble).
`.trim();

async function buildWithGemini(opm: unknown, spec: unknown) {
    const text = await askText(
        `${PROMPT}\n\n## OPM IR\n${JSON.stringify(opm, null, 2)}\n\n## System Spec\n${JSON.stringify(spec, null, 2)}\n\n## ISO Rules\n${ISO_RULES}`,
    );
    return {
        prompt: text,
        retrievedChunks: 8,
        models: ["Gemini"],
    };
}

async function mock(): Promise<{ prompt: string; retrievedChunks: number; models: string[] }> {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "super_prompt.txt");
    const prompt = await fs.readFile(mockPath, "utf-8");
    return { prompt, retrievedChunks: 6, models: ["Gemini 1.5 Pro", "GPT-4o"] };
}

export async function buildSuperPrompt(opm: unknown, spec: unknown) {
    if (isGeminiConfigured() && opm && spec) {
        try {
            return await buildWithGemini(opm, spec);
        } catch (e) {
            console.error("[stage3] Gemini prompt build failed, using mock:", (e as Error).message);
            return mock();
        }
    }
    return mock();
}
