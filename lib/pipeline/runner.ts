// Orchestrates the pipeline per capstone activity diagram.
//
// Flow:
//   0. Validate input (guard; abort on fail)
//   fork:
//     1.  Parse OPM elements
//     1b. Retrieve ISO 19450 rules (fast, local/static for single-AI mode)
//   join →
//   2.  Semantic Analysis → system spec
//   3.  Compose super-prompt from (OPM, spec, rules)  — happens inside
//       buildSuperPrompt() when real deps are available
//   4.  Code generation (Claude/Gemini) + write files to disk
//   5.  Build + refine loop (up to 3 iterations)

import { validateInput }     from "./stage0-validate";
import { parseOpm }          from "./stage1-parse";
import { deriveSpec }        from "./stage2-spec";
import { buildSuperPrompt }  from "./stage3-rag";
import { generateCode }      from "./stage4-codegen";
import { validateGenerated } from "./stage5-validate";
import { deployToCloud }     from "./stage6-deploy";
import { updateStage, getJob, patchJob } from "./jobs";
import type { StageId } from "./types";

const STAGE_DELAY_MS   = 200;
const STAGE_TIMEOUT_MS = 600_000;   // 10 min — deploy stage can exceed 5min
const MAX_RETRIES      = 1;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

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

    // Stage 0: input validation
    await sleep(200);
    const validation = await runStage(jobId, "validate_input", () =>
        validateInput({ filename: job.filename, format: job.format, filePath: job.filePath }),
    );
    if (!validation || !validation.valid) {
        const remaining: StageId[] = ["parse", "rag", "semantic", "generate", "validate", "deploy"];
        for (const s of remaining) markError(jobId, s, "skipped: input validation failed");
        return;
    }

    // Stages 1 + 1b: parse OPM in parallel with RAG retrieval (static text
    // for single-AI mode; just resolves quickly with the canonical ruleset).
    await sleep(STAGE_DELAY_MS);
    const [opmModel, _ragStub] = await Promise.all([
        runStage(jobId, "parse", () =>
            parseOpm({ filename: job.filename, format: job.format, filePath: job.filePath }),
        ),
        runStage(jobId, "rag", async () => ({
            retrievalMode: "inline-iso-19450",
            chunks: 8,
            note:   "Static rules injected into super-prompt at stage 3 compose.",
        })),
    ]);
    if (!opmModel) return;

    // Stage 2: semantic interpretation
    await sleep(STAGE_DELAY_MS);
    const spec = await runStage(jobId, "semantic", () => deriveSpec(opmModel));
    if (!spec) return;

    // Stage 3: code gen (super-prompt composed inside generateCode or via
    // buildSuperPrompt() then Claude/Gemini). We fold compose+generate into
    // one visible stage so the dashboard stays at 6 steps.
    await sleep(STAGE_DELAY_MS);
    const fileTree = await runStage(jobId, "generate", async () => {
        const superPrompt = await buildSuperPrompt(opmModel, spec);
        const gen = await generateCode(superPrompt, { jobId });
        // Persist the generated tree path on the job for download route.
        if (gen && typeof gen === "object" && "outputDir" in gen) {
            patchJob(jobId, { outputDir: (gen as { outputDir?: string }).outputDir });
        }
        return gen;
    });
    if (!fileTree) return;

    // Stage 4 in doc (our stage 5): validate + refine
    await sleep(STAGE_DELAY_MS);
    await runStage(jobId, "validate", () =>
        validateGenerated(fileTree, {
            jobId,
            spec,
            opmModel,
            outputDir: getJob(jobId)?.outputDir,
        }),
    );

    // Stage 6 (bonus): deploy to cloud. Skips gracefully if tokens absent.
    await sleep(STAGE_DELAY_MS);
    const j = getJob(jobId);
    await runStage(jobId, "deploy", () =>
        deployToCloud({
            jobId,
            filename:  job.filename,
            outputDir: j?.outputDir,
        }),
    );
}
