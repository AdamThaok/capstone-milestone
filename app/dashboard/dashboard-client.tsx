"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StageStatus = "pending" | "active" | "done";
type Stage = { id: string; label: string; status: StageStatus };

const INITIAL_STAGES: Stage[] = [
  { id: "parse", label: "1. OPM Analysis & Hybrid Visual-Semantic Parsing", status: "pending" },
  { id: "semantic", label: "2. Semantic Interpretation & System Specification", status: "pending" },
  { id: "rag", label: "3. Syntax-Aware RAG & Multi-Model Reasoning", status: "pending" },
  { id: "generate", label: "4. Full-Stack Code Generation", status: "pending" },
  { id: "validate", label: "5. Automated Validation & Refinement", status: "pending" },
];

const MOCK_TRACE = [
  { from: "Object: Customer", to: "DB table: customers" },
  { from: "Object: Order", to: "DB table: orders" },
  { from: "Process: Place Order", to: "POST /api/orders" },
  { from: "Process: Cancel Order", to: "DELETE /api/orders/:id" },
  { from: "State: Pending → Shipped", to: "status field + transition" },
  { from: "Aggregation: Order ◇ Item", to: "FK: order_items.order_id" },
];

export default function DashboardClient() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("auto");
  const [targetStack, setTargetStack] = useState("react-fastapi-firebase");
  const [dragging, setDragging] = useState(false);
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

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

  async function runPipeline() {
    if (!file) return;
    setRunning(true);
    setDone(false);
    setStages(INITIAL_STAGES.map((s) => ({ ...s, status: "pending" })));

    for (let i = 0; i < INITIAL_STAGES.length; i++) {
      setStages((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i ? "done" : idx === i ? "active" : "pending",
        }))
      );
      await new Promise((r) => setTimeout(r, 900));
    }
    setStages((prev) => prev.map((s) => ({ ...s, status: "done" })));
    setRunning(false);
    setDone(true);
  }

  function reset() {
    setFile(null);
    setStages(INITIAL_STAGES);
    setDone(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function downloadStub() {
    const blob = new Blob(
      [
        "Capstone Milestone — Generated Project (stub)\n\n" +
          "This is a placeholder ZIP. The real pipeline will emit a full-stack\n" +
          "React + FastAPI + Firebase project generated from your OPM diagram.\n\n" +
          `Source file: ${file?.name}\nFormat: ${format}\nTarget stack: ${targetStack}\n`,
      ],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "generated-project.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

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
              <button className="primary" disabled={!file || running} onClick={runPipeline}>
                {running ? "Generating..." : "Generate Application"}
              </button>
              {(file || done) && !running && (
                <button className="ghost" onClick={reset}>Reset</button>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>2. Generation Pipeline</h3>
            <p className="hint">AI Agent stages per project specification.</p>
            <div className="stages">
              {stages.map((s) => (
                <div key={s.id} className={`stage ${s.status}`}>
                  <div className="dot" />
                  <div className="label">{s.label}</div>
                  <div className="status">{s.status}</div>
                </div>
              ))}
            </div>

            {done && (
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
                <button className="primary" onClick={downloadStub}>
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
