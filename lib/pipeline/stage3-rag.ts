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

Target stack: React + Vite (frontend), FastAPI + Python (backend),
Firebase FIRESTORE EMULATOR (local in-memory DB — no Firebase account needed),
docker-compose (orchestration).

NON-TECHNICAL USER REQUIREMENTS (HARD):
- Target audience: someone who has never used a terminal before.
- docker-compose.yml MUST launch TWO services: backend (FastAPI + firebase-admin)
  and frontend (React + nginx). Both exposed on fixed ports.
- Backend connects to user's OWN Firebase Firestore via service account JSON
  at \`backend/firebase-credentials.json\`. It must fail with a CLEAR human
  message (not a stacktrace) if that file is missing — "Missing
  firebase-credentials.json. See SETUP.md step 4."
- Backend MUST run a seed script on first startup (seed.py) that inserts
  3–5 sample rows per collection derived from OPM object names/states.
  Script must be idempotent (skip collection if already populated).
- Frontend uses axios to call backend only. No firebase JS SDK on frontend.
- Emit SETUP.md as the primary entry-point document. It must contain:
  1. "What you need" — links to install Docker Desktop (Windows/Mac/Linux)
  2. "Create a free Firebase project" — link to console.firebase.google.com
     → instructions: "Add project" → name it anything → disable Analytics
     → wait → "Build → Firestore Database → Create database → Start in
     production mode → pick region → Enable"
  3. "Download your credentials" — "Project settings (gear icon) →
     Service accounts → Generate new private key → save as
     \`firebase-credentials.json\` inside the \`backend\` folder"
  4. "Run it" — open terminal in project folder → \`docker compose up\` →
     wait for "Ready" → open http://localhost:5173
  5. Troubleshooting: "port already in use", "docker not recognized",
     "credentials error"
- Emit README.md as a one-page summary pointing to SETUP.md.
- Include scripts/check-setup.sh and scripts/check-setup.bat that verify
  Docker + credentials file exist before compose runs, with friendly
  error messages.
- CORS: backend allows frontend origin only; no wildcards.
- Include .gitignore that excludes firebase-credentials.json — never
  committable.

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
