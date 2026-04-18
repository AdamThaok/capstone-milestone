// Stage 1: OPM Analysis & Hybrid Visual-Semantic Parsing
// Real impl: GPT-4o vision + structured OPCloud parser → opm_model.json.
// Current: picks a mock variant based on filename hash (simple/medium/complex).

import fs from "node:fs/promises";
import path from "node:path";

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

export async function parseOpm(input: {
    filename: string;
    format: string;
    filePath?: string;
}) {
    // Pick a mock variant deterministically from the filename so the same
    // upload always yields the same parse result. Falls back to default if
    // variant file does not exist on disk.
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
