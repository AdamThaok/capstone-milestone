// Stage 4: Full-Stack Code Generation
// Real impl: Claude emits React + FastAPI + Firestore project.
// Current: returns bundled mock file tree. Downloadable zip served from
// /mock-outputs/generated-project.zip (see download route).

import fs from "node:fs/promises";
import path from "node:path";

export async function generateCode(_superPrompt: { prompt: string }) {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "file_tree.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw);
}
