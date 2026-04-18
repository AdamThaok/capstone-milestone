// Stage 4: Full-Stack Code Generation.
// Real impl (Gemini single-AI): ask the model to emit a JSON object
// { files: [{ path, content }, ...] }. Runner writes each file to a tmp
// output dir under opm-out-*/. Returns a summary tree for the dashboard.
//
// Fallback: load mock file_tree.json and copy the bundled static scaffold
// zip into the output dir so downloads still work.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { askJson, CODEGEN_MODEL, isGeminiConfigured } from "@/lib/llm/gemini";

type FileSpec    = { path: string; content: string };
type GenResponse = { files: FileSpec[]; notes?: string };
type TreeNode    = { path: string; lines?: number; children?: TreeNode[] };

async function writeFiles(rootDir: string, files: FileSpec[]) {
    for (const f of files) {
        // Reject absolute or path-traversal entries.
        const rel = f.path.replace(/^[\\/]+/, "");
        if (rel.includes("..")) continue;
        const full = path.join(rootDir, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, f.content);
    }
}

function buildTree(files: FileSpec[]): TreeNode[] {
    return files.map((f) => ({
        path:  f.path,
        lines: f.content.split("\n").length,
    }));
}

async function generateWithGemini(superPrompt: { prompt: string }, jobId: string) {
    const prompt = `${superPrompt.prompt}

OUTPUT FORMAT (STRICT):
Return a single JSON object:
{
  "files": [
    { "path": "backend/app/main.py",           "content": "..." },
    { "path": "frontend/package.json",         "content": "..." },
    { "path": "README.md",                     "content": "..." },
    { "path": "TRACEABILITY.md",               "content": "..." },
    { "path": "docker-compose.yml",            "content": "..." }
  ],
  "notes": "anything the validator should know"
}

Rules:
- Emit a complete runnable project. Missing imports or empty stubs will fail validation.
- Keep file count reasonable (20–40 files). Prefer completeness over breadth.
- Every OPM object → entity; every OPM process → endpoint; every state-change
  link → transition endpoint with 409 guard.
- Firestore security rules must enforce agent-link ownership.
- TRACEABILITY.md must list every OPM ID (O*, P*, L*) and its code artifact.`;

    const res = await askJson<GenResponse>(prompt, CODEGEN_MODEL);
    if (!res || !Array.isArray(res.files) || res.files.length === 0) {
        throw new Error("codegen: empty or malformed files array");
    }

    const outDir = path.join(os.tmpdir(), `opm-out-${jobId}`);
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await writeFiles(outDir, res.files);

    return {
        root:        path.basename(outDir) + "/",
        totalFiles:  res.files.length,
        totalLines:  res.files.reduce((n, f) => n + f.content.split("\n").length, 0),
        tree:        buildTree(res.files),
        outputDir:   outDir,
        notes:       res.notes ?? "",
        engine:      "gemini",
    };
}

async function generateMock(): Promise<Record<string, unknown>> {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "file_tree.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw);
}

export async function generateCode(
    superPrompt: { prompt: string; retrievedChunks?: number; models?: string[] },
    ctx: { jobId: string },
) {
    if (isGeminiConfigured()) {
        try {
            return await generateWithGemini(superPrompt, ctx.jobId);
        } catch (e) {
            console.error("[stage4] Gemini codegen failed, using mock:", (e as Error).message);
            return generateMock();
        }
    }
    return generateMock();
}
