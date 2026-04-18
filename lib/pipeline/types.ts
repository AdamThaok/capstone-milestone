// Shared types for all pipeline stages.
// Each stage reads its input, emits a structured output.
// Currently all stages return mock data; swap impls for real LLM calls later.

export type StageId = "parse" | "semantic" | "rag" | "generate" | "validate";

export type StageStatus = "pending" | "active" | "done" | "error";

export type StageResult = {
    stage: StageId;
    status: StageStatus;
    startedAt: string;
    finishedAt?: string;
    output?: unknown;       // JSON blob viewable in UI
    error?: string;
};

export type JobState = {
    id: string;
    filename: string;
    format: string;
    targetStack: string;
    createdAt: string;
    stages: StageResult[];
    done: boolean;
};
