// In-memory job store. Dev-only — production would use Firestore or Redis.

import type { JobState, StageResult } from "./types";

const jobs = new Map<string, JobState>();

export function createJob(input: {
    filename: string;
    format: string;
    targetStack: string;
    filePath?: string;
}): JobState {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const job: JobState = {
        id,
        filename:    input.filename,
        filePath:    input.filePath,
        format:      input.format,
        targetStack: input.targetStack,
        createdAt:   now,
        stages: [
            { stage: "validate_input", status: "pending", startedAt: now },
            { stage: "parse",          status: "pending", startedAt: now },
            { stage: "rag",            status: "pending", startedAt: now },
            { stage: "semantic",       status: "pending", startedAt: now },
            { stage: "generate",       status: "pending", startedAt: now },
            { stage: "validate",       status: "pending", startedAt: now },
        ],
        done: false,
    };
    jobs.set(id, job);
    return job;
}

export function getJob(id: string): JobState | undefined {
    return jobs.get(id);
}

export function updateStage(
    id: string,
    stage: StageResult["stage"],
    patch: Partial<StageResult>,
) {
    const job = jobs.get(id);
    if (!job) return;
    const idx = job.stages.findIndex((s) => s.stage === stage);
    if (idx < 0) return;
    job.stages[idx] = { ...job.stages[idx], ...patch };
    const allDone    = job.stages.every((s) => s.status === "done");
    const anyError   = job.stages.some((s)  => s.status === "error");
    if (allDone || anyError) job.done = true;
}
