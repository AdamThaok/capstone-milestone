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

const STAGE_DELAY_MS = 1000;

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
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

export async function runPipeline(jobId: string) {
    const job = getJob(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);

    // Stage 0: input validation (guard)
    markActive(jobId, "validate_input");
    await sleep(500);
    const validation = await validateInput({ filename: job.filename, format: job.format });
    markDone(jobId, "validate_input", validation);
    if (!validation.valid) {
        // Abort — propagate error through remaining stages
        const remaining: StageId[] = ["parse", "rag", "semantic", "generate", "validate"];
        for (const s of remaining) markError(jobId, s, "skipped: input validation failed");
        return;
    }

    // Stages 1 + 2 run in parallel (per activity diagram fork)
    markActive(jobId, "parse");
    markActive(jobId, "rag");
    await sleep(STAGE_DELAY_MS);
    const [opmModel, superPromptPartial] = await Promise.all([
        parseOpm({ filename: job.filename, format: job.format }),
        buildSuperPrompt(null, null), // RAG retrieval runs without the spec yet
    ]);
    markDone(jobId, "parse", opmModel);
    markDone(jobId, "rag",   superPromptPartial);

    // Stage 3: semantic interpretation (Gemini) — join point
    markActive(jobId, "semantic");
    await sleep(STAGE_DELAY_MS);
    const spec = await deriveSpec(opmModel);
    markDone(jobId, "semantic", spec);

    // Stage 4: code generation (Claude)
    markActive(jobId, "generate");
    await sleep(STAGE_DELAY_MS);
    const fileTree = await generateCode(superPromptPartial);
    markDone(jobId, "generate", fileTree);

    // Stage 5: validation + refinement loop
    markActive(jobId, "validate");
    await sleep(STAGE_DELAY_MS);
    const report = await validateGenerated(fileTree);
    markDone(jobId, "validate", report);
}
