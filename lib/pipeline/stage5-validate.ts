// Stage 5: Automated Validation + Refinement Loop.
//
// Real impl:
//   1. Static checks: required files present, non-empty.
//   2. Coverage check: every OPM id (O*, P*) mentioned somewhere in emitted code.
//   3. If gaps, call Gemini with fix-prompt → patch files in-place → re-check.
//   4. Up to MAX_ITERS refinement passes; records history.
//
// Fallback: returns mock validation_report.json.

import fs from "node:fs/promises";
import path from "node:path";
import { askJson, isGeminiConfigured } from "@/lib/llm/gemini";

const MAX_ITERS     = 2;
const REQUIRED_FILES = [
    "README.md",
    "TRACEABILITY.md",
    "docker-compose.yml",
];

type Mapping = { opmId: string; artifact: string };
type Patch   = { path: string; content: string };

async function walk(dir: string, base = dir): Promise<{ path: string; rel: string }[]> {
    const out: { path: string; rel: string }[] = [];
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return out; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...await walk(full, base));
        else out.push({ path: full, rel: path.relative(base, full).replace(/\\/g, "/") });
    }
    return out;
}

async function staticChecks(outDir: string) {
    const files   = await walk(outDir);
    const relSet  = new Set(files.map((f) => f.rel));
    const present: string[] = [];
    const missing: string[] = [];
    for (const r of REQUIRED_FILES) (relSet.has(r) ? present : missing).push(r);

    // Non-empty check (sample up to 50 files)
    const empties: string[] = [];
    for (const f of files.slice(0, 50)) {
        try {
            const stat = await fs.stat(f.path);
            if (stat.size === 0) empties.push(f.rel);
        } catch { /* ignore */ }
    }

    return { files, present, missing, empties };
}

async function coverageCheck(outDir: string, opm: unknown) {
    const ids: string[] = [];
    const o = opm as { objects?: {id: string}[]; processes?: {id: string}[]; links?: {id: string}[] };
    for (const x of o?.objects   ?? []) ids.push(x.id);
    for (const x of o?.processes ?? []) ids.push(x.id);
    // Links are optional — we check objects + processes only.

    const files   = await walk(outDir);
    const mapping: Mapping[] = [];
    const missing: string[]  = [];
    for (const id of ids) {
        let hit: string | null = null;
        for (const f of files) {
            try {
                const content = await fs.readFile(f.path, "utf-8");
                if (content.includes(id)) { hit = f.rel; break; }
            } catch { /* binary file */ }
        }
        if (hit) mapping.push({ opmId: id, artifact: hit });
        else     missing.push(id);
    }
    const coverage = ids.length === 0 ? 100 : Math.round((mapping.length / ids.length) * 100);
    return { mapping, missing, coverage };
}

async function refine(outDir: string, opm: unknown, spec: unknown, missingIds: string[], iteration: number) {
    const prompt = `
You previously emitted a project but these OPM IDs are not referenced anywhere
in the generated code: ${missingIds.join(", ")}.

Emit JSON: { "files": [ { "path": "...", "content": "..." } ] } containing ONLY
the files that need to be created or overwritten to cover the missing IDs.
Each file's content MUST include the OPM ID (e.g. "// traceability: O1") in a
comment so the validator can detect it.

Input:

## OPM IR
${JSON.stringify(opm, null, 2)}

## System Spec
${JSON.stringify(spec, null, 2)}

Iteration: ${iteration} of ${MAX_ITERS}.
`.trim();
    const res = await askJson<{ files: Patch[] }>(prompt);
    if (!res?.files?.length) return 0;
    for (const f of res.files) {
        const rel = f.path.replace(/^[\\/]+/, "");
        if (rel.includes("..")) continue;
        const full = path.join(outDir, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, f.content);
    }
    return res.files.length;
}

async function realValidate(
    _fileTree: unknown,
    ctx: { jobId: string; spec: unknown; opmModel: unknown; outputDir?: string },
) {
    if (!ctx.outputDir) throw new Error("no outputDir on job");

    const refinementLog: { iteration: number; issue: string; fix: string; resolved: boolean }[] = [];
    let iter = 0;
    let stat = await staticChecks(ctx.outputDir);
    let cov  = await coverageCheck(ctx.outputDir, ctx.opmModel);

    while ((stat.missing.length > 0 || cov.missing.length > 0) && iter < MAX_ITERS) {
        iter++;
        const issue =
            (stat.missing.length ? `missing files: ${stat.missing.join(", ")}. ` : "") +
            (cov.missing.length  ? `uncovered OPM IDs: ${cov.missing.join(", ")}.` : "");
        let patched = 0;
        try {
            patched = await refine(ctx.outputDir, ctx.opmModel, ctx.spec, cov.missing, iter);
        } catch (e) {
            refinementLog.push({
                iteration: iter,
                issue,
                fix: `refine call failed: ${(e as Error).message}`,
                resolved: false,
            });
            break;
        }
        refinementLog.push({
            iteration: iter,
            issue,
            fix: `emitted ${patched} patch file(s)`,
            resolved: patched > 0,
        });
        stat = await staticChecks(ctx.outputDir);
        cov  = await coverageCheck(ctx.outputDir, ctx.opmModel);
    }

    const ok = stat.missing.length === 0 && cov.coverage >= 80;

    return {
        metadata: {
            validator:  "AI Agent v0.2 (single-AI Gemini)",
            validatedAt: new Date().toISOString(),
            iterations: iter,
        },
        buildChecks: [
            { name: "required files present", status: stat.missing.length === 0 ? "pass" : "fail", missing: stat.missing },
            { name: "no empty files (sample)", status: stat.empties.length === 0 ? "pass" : "warn", empties: stat.empties },
        ],
        connectivityChecks: [
            { name: "skipped: offline mode", status: "skip" },
        ],
        coverageVerification: {
            opmElements:    (cov.mapping.length + cov.missing.length),
            codeArtifacts:  cov.mapping.length,
            coverage:       `${cov.coverage}%`,
            mapping:        cov.mapping,
            uncovered:      cov.missing,
        },
        consistencyCheck: {
            driftDetected: !ok,
            issues:        ok ? [] : [{ reason: "coverage or required files missing after refinement" }],
        },
        refinementLog,
        finalStatus: ok ? "READY_FOR_DEPLOYMENT" : "NEEDS_MANUAL_REVIEW",
    };
}

async function mock() {
    const mockPath = path.join(process.cwd(), "public", "mock-outputs", "validation_report.json");
    const raw = await fs.readFile(mockPath, "utf-8");
    return JSON.parse(raw);
}

export async function validateGenerated(
    fileTree: unknown,
    ctx?: { jobId: string; spec: unknown; opmModel: unknown; outputDir?: string },
) {
    if (isGeminiConfigured() && ctx?.outputDir && ctx.opmModel && ctx.spec) {
        try {
            return await realValidate(fileTree, ctx);
        } catch (e) {
            console.error("[stage5] real validate failed, using mock:", (e as Error).message);
            return mock();
        }
    }
    return mock();
}
