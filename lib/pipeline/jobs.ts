// Disk-backed job store.
// Survives dev-server restarts (Next HMR) and serverless cold starts.
// Each job lives at <tmp>/opm-jobs/<id>.json. Pipeline writes every time
// updateStage/patchJob runs so the dashboard keeps polling the current state.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { JobState, StageResult } from "./types";

const STORE_DIR = path.join(os.tmpdir(), "opm-jobs");

function ensureDir() {
    try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch { /* exists */ }
}

function jobPath(id: string) { return path.join(STORE_DIR, `${id}.json`); }

function writeJob(job: JobState) {
    ensureDir();
    fs.writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2), "utf-8");
}

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
            { stage: "deploy",         status: "pending", startedAt: now },
        ],
        done: false,
    };
    writeJob(job);
    return job;
}

export function getJob(id: string): JobState | undefined {
    try {
        const raw = fs.readFileSync(jobPath(id), "utf-8");
        return JSON.parse(raw) as JobState;
    } catch {
        return undefined;
    }
}

export function patchJob(id: string, patch: Partial<JobState>) {
    const j = getJob(id);
    if (!j) return;
    Object.assign(j, patch);
    writeJob(j);
}

export function updateStage(
    id: string,
    stage: StageResult["stage"],
    patch: Partial<StageResult>,
) {
    const job = getJob(id);
    if (!job) return;
    const idx = job.stages.findIndex((s) => s.stage === stage);
    if (idx < 0) return;
    job.stages[idx] = { ...job.stages[idx], ...patch };

    const allDone  = job.stages.every((s) => s.status === "done");
    const anyError = job.stages.some((s)  => s.status === "error");
    if (allDone || anyError) job.done = true;

    writeJob(job);
}
