"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StageStatus = "pending" | "active" | "done" | "error";
type StageId = "parse" | "semantic" | "rag" | "generate" | "validate";

type StageResult = {
    stage: StageId;
    status: StageStatus;
    startedAt: string;
    finishedAt?: string;
    output?: unknown;
    error?: string;
};

type JobState = {
    id: string;
    filename: string;
    format: string;
    targetStack: string;
    createdAt: string;
    stages: StageResult[];
    done: boolean;
};

const STAGE_LABELS: Record<StageId, string> = {
    parse:    "1. OPM Analysis & Hybrid Visual-Semantic Parsing",
    semantic: "2. Semantic Interpretation & System Specification",
    rag:      "3. Syntax-Aware RAG & Multi-Model Reasoning",
    generate: "4. Full-Stack Code Generation",
    validate: "5. Automated Validation & Refinement",
};

const MOCK_TRACE = [
    { from: "Object: Customer",            to: "Firestore collection: customers" },
    { from: "Object: Order",               to: "Firestore collection: orders" },
    { from: "Process: Place Order",        to: "POST /orders (FastAPI)" },
    { from: "Process: Cancel Order",       to: "DELETE /orders/:id" },
    { from: "State: Pending → Paid",       to: "transitions.py:pay()" },
    { from: "State: Paid → Shipped",       to: "transitions.py:ship()" },
    { from: "Aggregation: Order ◇ Item",   to: "items subcollection" },
];

export default function DashboardClient() {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [format, setFormat] = useState("auto");
    const [targetStack, setTargetStack] = useState("react-fastapi-firebase");
    const [dragging, setDragging] = useState(false);
    const [job, setJob] = useState<JobState | null>(null);
    const [expanded, setExpanded] = useState<StageId | null>(null);

    async function logout() {
        await fetch("/api/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) setFile(f);
    }

    function onPick(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (f) setFile(f);
    }

    async function startPipeline() {
        if (!file) return;
        const body = new FormData();
        body.append("file", file);
        body.append("format", format);
        body.append("targetStack", targetStack);
        const res = await fetch("/api/generate", { method: "POST", body });
        if (!res.ok) return;
        const { jobId } = await res.json();

        // Poll every 500ms until done
        const poll = async () => {
            const r = await fetch(`/api/generate/${jobId}`);
            if (!r.ok) return;
            const state: JobState = await r.json();
            setJob(state);
            if (!state.done) setTimeout(poll, 500);
        };
        poll();
    }

    function reset() {
        setFile(null);
        setJob(null);
        setExpanded(null);
        if (fileInput.current) fileInput.current.value = "";
    }

    function downloadProject() {
        if (!job?.done) return;
        window.location.href = `/api/generate/${job.id}/download`;
    }

    const running = !!job && !job.done;

    return (
        <div className="shell">
            <header className="topbar">
                <div className="brand">OPM<span>→</span>Code</div>
                <div className="user">
                    <span>admin</span>
                    <button className="ghost" onClick={logout}>Log out</button>
                </div>
            </header>

            <main className="main">
                <h2>Generate full-stack app from OPM diagram</h2>
                <p className="lead">
                    Upload an Object-Process Methodology diagram. The AI agent parses it, infers the system
                    specification, and generates a complete runnable application.
                </p>

                <div className="grid">
                    <div className="panel">
                        <h3>1. Upload OPM Model</h3>
                        <p className="hint">ISO 19450 compliant. No prompts or configuration required.</p>

                        <label
                            className={`drop ${dragging ? "hover" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                        >
                            <input
                                ref={fileInput}
                                type="file"
                                accept=".xml,.json,.opx,.png,.jpg,.jpeg"
                                onChange={onPick}
                            />
                            <div className="icon">⬆</div>
                            <div className="label">
                                {file ? "Replace file" : "Drop OPM file here or click to browse"}
                            </div>
                            <div className="formats">XML · JSON · OPX · PNG · JPG</div>
                        </label>

                        {file && (
                            <div className="filebadge">
                                <span className="name">{file.name}</span>
                                <span className="size">{(file.size / 1024).toFixed(1)} KB</span>
                            </div>
                        )}

                        <div style={{ height: "1rem" }} />

                        <div className="field">
                            <label>Input Format</label>
                            <select value={format} onChange={(e) => setFormat(e.target.value)}>
                                <option value="auto">Auto-detect</option>
                                <option value="xml">OPCloud XML</option>
                                <option value="json">OPCloud JSON</option>
                                <option value="opx">OPX</option>
                                <option value="image">OPD Image (vision)</option>
                            </select>
                        </div>

                        <div className="field">
                            <label>Target Stack</label>
                            <select value={targetStack} onChange={(e) => setTargetStack(e.target.value)}>
                                <option value="react-fastapi-firebase">React + FastAPI + Firebase</option>
                                <option value="react-node-postgres">React + Node + PostgreSQL</option>
                                <option value="nextjs-supabase">Next.js + Supabase</option>
                            </select>
                        </div>

                        <div className="actions">
                            <button className="primary" disabled={!file || running} onClick={startPipeline}>
                                {running ? "Generating..." : "Generate Application"}
                            </button>
                            {(file || job) && !running && (
                                <button className="ghost" onClick={reset}>Reset</button>
                            )}
                        </div>
                    </div>

                    <div className="panel">
                        <h3>2. Generation Pipeline</h3>
                        <p className="hint">AI Agent stages per project specification.</p>
                        <div className="stages">
                            {(job?.stages ?? placeholderStages()).map((s) => {
                                const isExpandable = s.status === "done" && !!s.output;
                                return (
                                    <div
                                        key={s.stage}
                                        className={`stage ${s.status}`}
                                        style={{ cursor: isExpandable ? "pointer" : "default" }}
                                        onClick={() => isExpandable && setExpanded(expanded === s.stage ? null : s.stage)}
                                    >
                                        <div className="dot" />
                                        <div className="label">{STAGE_LABELS[s.stage]}</div>
                                        <div className="status">{s.status}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {expanded && job && (
                            <div style={{ marginTop: "0.75rem" }}>
                                <div className="hint">Stage output preview:</div>
                                <pre style={{
                                    background: "#0f1115",
                                    color: "#c8d3e1",
                                    padding: "0.75rem",
                                    borderRadius: "6px",
                                    maxHeight: "320px",
                                    overflow: "auto",
                                    fontSize: "0.78rem",
                                }}>
                                    {formatOutput(job.stages.find((s) => s.stage === expanded)?.output)}
                                </pre>
                            </div>
                        )}

                        {job?.done && (
                            <>
                                <div style={{ height: "1.5rem" }} />
                                <h3>3. Traceability Report</h3>
                                <p className="hint">OPM elements → generated code artifacts.</p>
                                <div>
                                    {MOCK_TRACE.map((t, i) => (
                                        <div key={i} className="trace-row">
                                            <span className="from">{t.from}</span>
                                            <span className="arrow">→</span>
                                            <span className="to">{t.to}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ height: "1rem" }} />
                                <button className="primary" onClick={downloadProject}>
                                    Download Project (ZIP)
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

function placeholderStages(): StageResult[] {
    const now = new Date().toISOString();
    return (Object.keys(STAGE_LABELS) as StageId[]).map((id) => ({
        stage: id,
        status: "pending" as StageStatus,
        startedAt: now,
    }));
}

function formatOutput(out: unknown): string {
    if (typeof out === "string") return out;
    try {
        return JSON.stringify(out, null, 2);
    } catch {
        return String(out);
    }
}
