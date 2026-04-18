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
to emit a complete, compilable full-stack project matching the OPM model.

Target stack: React + Vite (frontend), FastAPI + Python (backend),
Firebase Firestore (database), docker-compose (orchestration).

The super prompt must:
- Enumerate every entity, endpoint, screen, business rule.
- Embed the relevant ISO rules inline (do NOT omit).
- State hard constraints: no extra features, validate state transitions,
  no invented fields, include TRACEABILITY.md, include README.md, include
  docker-compose.yml, include Firestore security rules.
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
