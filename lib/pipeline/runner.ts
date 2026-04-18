// Orchestrates the 5-stage pipeline. Fires stages sequentially with small
// delays to simulate real work. Swap delays + mock fns for real LLM calls.

import { parseOpm }          from "./stage1-parse";
import { deriveSpec }        from "./stage2-spec";
import { buildSuperPrompt }  from "./stage3-rag";
import { generateCode }      from "./stage4-codegen";
import { validateGenerated } from "./stage5-validate";
import { updateStage, getJob } from "./jobs";

const STAGE_DELAY_MS = 1200;

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function runPipeline(jobId: string) {
    const job = getJob(jobId);
    if (!job) throw new Error(`job ${jobId} not found`);

    // Stage 1
    updateStage(jobId, "parse", { status: "active", startedAt: new Date().toISOString() });
    await sleep(STAGE_DELAY_MS);
    const opmModel = await parseOpm({ filename: job.filename, format: job.format });
    updateStage(jobId, "parse", { status: "done", finishedAt: new Date().toISOString(), output: opmModel });

    // Stage 2
    updateStage(jobId, "semantic", { status: "active", startedAt: new Date().toISOString() });
    await sleep(STAGE_DELAY_MS);
    const spec = await deriveSpec(opmModel);
    updateStage(jobId, "semantic", { status: "done", finishedAt: new Date().toISOString(), output: spec });

    // Stage 3
    updateStage(jobId, "rag", { status: "active", startedAt: new Date().toISOString() });
    await sleep(STAGE_DELAY_MS);
    const superPrompt = await buildSuperPrompt(opmModel, spec);
    updateStage(jobId, "rag", { status: "done", finishedAt: new Date().toISOString(), output: superPrompt });

    // Stage 4
    updateStage(jobId, "generate", { status: "active", startedAt: new Date().toISOString() });
    await sleep(STAGE_DELAY_MS);
    const fileTree = await generateCode(superPrompt);
    updateStage(jobId, "generate", { status: "done", finishedAt: new Date().toISOString(), output: fileTree });

    // Stage 5
    updateStage(jobId, "validate", { status: "active", startedAt: new Date().toISOString() });
    await sleep(STAGE_DELAY_MS);
    const report = await validateGenerated(fileTree);
    updateStage(jobId, "validate", { status: "done", finishedAt: new Date().toISOString(), output: report });
}
