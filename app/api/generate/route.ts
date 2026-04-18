import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createJob } from "@/lib/pipeline/jobs";
import { runPipeline } from "@/lib/pipeline/runner";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
    const jar = await cookies();
    if (jar.get("session")?.value !== "ok")
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const format = (form.get("format") as string) || "auto";
    const targetStack = (form.get("targetStack") as string) || "react-fastapi-firebase";

    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES)
        return NextResponse.json(
            { error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` },
            { status: 413 },
        );

    // Persist upload under OS tmp so real parsers can open it.
    const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), "opm-job-"));
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const filePath = path.join(jobDir, safeName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, bytes);

    const job = createJob({ filename: file.name, format, targetStack, filePath });

    runPipeline(job.id).catch((err) => console.error("pipeline error:", err));

    return NextResponse.json({ jobId: job.id });
}
