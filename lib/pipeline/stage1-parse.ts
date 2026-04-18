// Stage 1: OPM Analysis & Hybrid Visual-Semantic Parsing
// Real impl: GPT-4o vision + structured OPCloud parser → opm_model.json
// Current: returns bundled mock OPM model.

import fs from "node:fs/promises";
import path from "node:path";

export async function parseOpm(_input: { filename: string; format: string }) {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "opm_model.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw);
}
