// Stage 1: OPM Analysis & Parsing
// Real impl (when GOOGLE_API_KEY set): Gemini reads uploaded file bytes and
// extracts OPM elements into canonical JSON IR.
// Fallback: picks a mock variant by filename hash.

import fs from "node:fs/promises";
import path from "node:path";
import { askMultimodalJson, askJson, isGeminiConfigured } from "@/lib/llm/gemini";

const VARIANTS = [
    "opm_model.json",
    "opm_model_simple.json",
    "opm_model_complex.json",
];

function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

const IR_SCHEMA_PROMPT = `
You are an OPM (Object-Process Methodology, ISO 19450:2015) parser.
Extract the canonical Intermediate Representation from the attached OPM diagram file.

Emit JSON exactly in this shape (no extras):

{
  "metadata": { "standard": "ISO 19450:2015", "parser": "Gemini" },
  "diagrams":  [ { "id": "SD",  "name": "System Diagram", "level": 0 } ],
  "objects":   [ { "id": "O1", "name": "...", "kind": "informatical", "states": [] } ],
  "processes": [ { "id": "P1", "name": "...", "diagram": "SD" } ],
  "links":     [ { "id": "L1", "type": "agent|instrument|consumption|result|effect|condition|invocation|event|aggregation|exhibition|generalization|instantiation|state-change", "from": "...", "to": "...", "via": "...(optional, for state-change)" } ]
}

Rules:
- Use O1..On for object IDs, P1..Pn for processes, L1..Ln for links.
- For state-change, write from/to as "ObjectName.StateName".
- States live inside their owning object's "states" array as strings.
- If the diagram hierarchy is unclear, use a single "SD" diagram.
`.trim();

type OpmModel = {
    metadata?: Record<string, unknown>;
    [k: string]: unknown;
};

async function parseWithGemini(input: { filePath: string; filename: string; format: string }): Promise<OpmModel> {
    const bytes = await fs.readFile(input.filePath);
    const ext = input.filename.split(".").pop()?.toLowerCase() ?? "";

    // Image formats → vision path
    if (["png", "jpg", "jpeg"].includes(ext)) {
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        return await askMultimodalJson<OpmModel>(IR_SCHEMA_PROMPT, {
            mime,
            base64: bytes.toString("base64"),
        });
    }

    // Text formats (XML / JSON / OPX-as-XML) → inline in prompt
    const text = bytes.toString("utf-8");
    const MAX = 60_000;
    const snippet = text.length > MAX ? text.slice(0, MAX) + "\n<!-- truncated -->" : text;
    return await askJson<OpmModel>(
        `${IR_SCHEMA_PROMPT}\n\nInput file (${ext || input.format}):\n\n${snippet}`,
    );
}

async function parseMock(input: { filename: string; format: string }): Promise<OpmModel> {
    const variant = VARIANTS[hash(input.filename) % VARIANTS.length];
    const base = path.join(process.cwd(), "public", "mock-outputs");
    for (const candidate of [variant, "opm_model.json"]) {
        try {
            const raw = await fs.readFile(path.join(base, candidate), "utf-8");
            const parsed = JSON.parse(raw);
            parsed.metadata = {
                ...(parsed.metadata ?? {}),
                sourceFilename: input.filename,
                sourceFormat:   input.format,
                mockVariant:    candidate,
            };
            return parsed;
        } catch {
            continue;
        }
    }
    throw new Error("stage1-parse: no mock output found");
}

export async function parseOpm(input: {
    filename: string;
    format: string;
    filePath?: string;
}): Promise<OpmModel> {
    if (isGeminiConfigured() && input.filePath) {
        try {
            const model = await parseWithGemini({
                filePath: input.filePath,
                filename: input.filename,
                format:   input.format,
            });
            model.metadata = {
                ...(model.metadata ?? {}),
                sourceFilename: input.filename,
                sourceFormat:   input.format,
                engine:         "gemini",
            };
            return model;
        } catch (e) {
            console.error("[stage1] Gemini parse failed, using mock:", (e as Error).message);
            return parseMock(input);
        }
    }
    return parseMock(input);
}
