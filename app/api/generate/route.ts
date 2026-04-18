import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createJob } from "@/lib/pipeline/jobs";
import { runPipeline } from "@/lib/pipeline/runner";

export async function POST(req: Request) {
    const jar = await cookies();
    if (jar.get("session")?.value !== "ok")
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const format = (form.get("format") as string) || "auto";
    const targetStack = (form.get("targetStack") as string) || "react-fastapi-firebase";

    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    const job = createJob({ filename: file.name, format, targetStack });

    // Fire and forget — pipeline runs in background, client polls /api/generate/:id
    runPipeline(job.id).catch((err) => console.error("pipeline error:", err));

    return NextResponse.json({ jobId: job.id });
}
