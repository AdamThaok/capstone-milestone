// Orchestrates the 6-stage pipeline per capstone activity diagram.
//
// Flow:
//   0. Validate input → (if invalid, abort with error, emit error stage)
//   fork:
//     1. Parse OPM Elements
//     2. Retrieve ISO 19450 RAG rules
//   join →
//   3. Semantic Analysis + Blueprint (Gemini) → Prompt Composer (ChatGPT)
//   4. Code Generation (Claude)
//   5. Validate + Refinement Loop

import { validateInput }     from "./stage0-validate";
import { parseOpm }          from "./stage1-parse";
import { deriveSpec }        from "./stage2-spec";
import { buildSuperPrompt }  from "./stage3-rag";
import { generateCode }      from "./stage4-codegen";
import { validateGenerated } from "./stage5-validate";
import { updateStage, getJob } from "./jobs";
import type { StageId } from "./types";

const STAGE_DELAY_MS   = 1000;
const STAGE_TIMEOUT_MS = 60_000;
const MAX_RETRIES      = 2;

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then((v) => { clearTimeout(t); resolve(v); },
               (e) => { clearTimeout(t); reject(e); });
    });
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let last: unknown;
    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            return await withTimeout(fn(), STAGE_TIMEOUT_MS, label);
        } catch (e) {
            last = e;
            if (i < MAX_RETRIES) await sleep(500 * (i + 1));
        }
    }
    throw last instanceof Error ? last : new Error(`${label} failed`);
}

function markActive(jobId: string, stage: StageId) {
    updateStage(jobId, stage, { status: "active", startedAt: new Date().toISOString() });
}

function markDone(jobId: string, stage: StageId, output: unknown) {
    updateStage(jobId, stage, { status: "done", finishedAt: new Date().toISOString(), output });
}

function markError(jobId: string, stage: StageId, error: string) {
    updateStage(jobId, stage, { status: "error", finishedAt: new Date().toISOString(), error });
}

// Runs a stage fn; records active/done/error status automatically.
async function runStage<T>(
    jobId: string,
    stage: StageId,
    fn: () => Promise<T>,
): Promise<T | null> {
    markActive(jobId, stage);
    try {
        const out = await withRetry(fn, stage);
        markDone(jobId, stage, out);
        return out;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        markError(jobId, stage, msg);
        console.error(`[pipeline ${jobId}] ${stage} failed:`, msg);
        return null;
    }
}

export async function runPipeline(jobId: string) {
    const job = getJob(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);

    // Stage 0: input validation (guard)
    await sleep(500);
    const validation = await runStage(jobId, "validate_input", () =>
        validateInput({ filename: job.filename, format: job.format, filePath: job.filePath }),
    );
    if (!validation || !validation.valid) {
        const remaining: StageId[] = ["parse", "rag", "semantic", "generate", "validate"];
        for (const s of remaining) markError(jobId, s, "skipped: input validation failed");
        return;
    }

    // Stages 1 + 1b run in parallel (activity diagram fork)
    await sleep(STAGE_DELAY_MS);
    const [opmModel, superPromptPartial] = await Promise.all([
        runStage(jobId, "parse", () =>
            parseOpm({ filename: job.filename, format: job.format, filePath: job.filePath }),
        ),
        runStage(jobId, "rag", () => buildSuperPrompt(null, null)),
    ]);
    if (!opmModel || !superPromptPartial) return;

    // Stage 2: semantic (join)
    await sleep(STAGE_DELAY_MS);
    const spec = await runStage(jobId, "semantic", () => deriveSpec(opmModel));
    if (!spec) return;

    // Stage 3: code gen
    await sleep(STAGE_DELAY_MS);
    const fileTree = await runStage(jobId, "generate", () => generateCode(superPromptPartial));
    if (!fileTree) return;

    // Stage 4: validate
    await sleep(STAGE_DELAY_MS);
    await runStage(jobId, "validate", () => validateGenerated(fileTree));
}
