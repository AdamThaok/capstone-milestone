// Stage 2: Semantic Interpretation & System Specification
// Real impl (Gemini): derive domain model, API surface, frontend screens
// from the OPM IR. Fallback: load mock system_spec.json.

import fs from "node:fs/promises";
import path from "node:path";
import { askJson, isGeminiConfigured } from "@/lib/llm/gemini";

const SPEC_PROMPT = `
You are a software architect. Convert the attached OPM Intermediate Representation
into a concrete full-stack system specification.

Emit JSON exactly in this shape:

{
  "metadata": { "derivedFrom": "opm_model.json", "inferenceEngine": "Gemini" },
  "domainModel": {
    "entities": [
      {
        "name": "Customer",
        "source": "O1",
        "persistence": "firestore",
        "fields": [
          { "name": "id", "type": "string", "primary": true },
          { "name": "status", "type": "enum", "values": ["A","B"], "default": "A" }
        ]
      }
    ]
  },
  "api": {
    "framework": "FastAPI",
    "endpoints": [
      { "method": "POST", "path": "/orders", "source": "P1", "op": "create" },
      { "method": "POST", "path": "/orders/:id/pay", "source": "P3", "op": "transition", "transition": "Pending->Paid" }
    ]
  },
  "frontend": {
    "framework": "React",
    "screens": [
      { "name": "OrderList", "route": "/", "reads": ["Order"] }
    ]
  },
  "businessRules": [
    { "id": "BR1", "source": "L5", "rule": "Pending->Paid only via P3" }
  ]
}

Rules:
- Every entity must trace back to an OPM object via "source": "O<id>".
- Every endpoint must trace back to an OPM process via "source": "P<id>" (or "derived" for CRUD reads).
- Every state-change link becomes either an enum with transitions, or a dedicated endpoint.
- Every aggregation link becomes a foreign key from part → whole.
- No features beyond what the OPM model contains.
`.trim();

async function deriveWithGemini(opm: unknown) {
    return await askJson(
        `${SPEC_PROMPT}\n\nOPM IR:\n${JSON.stringify(opm, null, 2)}`,
    );
}

async function deriveMock(): Promise<unknown> {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "system_spec.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw);
}

export async function deriveSpec(opmModel: unknown) {
    if (isGeminiConfigured()) {
        try {
            return await deriveWithGemini(opmModel);
        } catch (e) {
            console.error("[stage2] Gemini spec failed, using mock:", (e as Error).message);
            return deriveMock();
        }
    }
    return deriveMock();
}
