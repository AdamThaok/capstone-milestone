import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getJob } from "@/lib/pipeline/jobs";
import fs from "node:fs/promises";
import path from "node:path";

// Serves a static sample zip. Real impl would build the zip from stage 4
// output in-memory. For now we return a pre-made placeholder zip bundled
// in public/mock-outputs/. If the zip doesn't exist we fall back to a
// plaintext blob describing what would have been generated.

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ id: string }> },
) {
    const jar = await cookies();
    if (jar.get("session")?.value !== "ok")
        return new NextResponse("unauthorized", { status: 401 });

    const { id } = await ctx.params;
    const job = getJob(id);
    if (!job || !job.done)
        return new NextResponse("job not ready", { status: 409 });

    const zipPath = path.join(process.cwd(), "public", "mock-outputs", "generated-project.zip");

    try {
        const buf = await fs.readFile(zipPath);
        return new NextResponse(buf as unknown as BodyInit, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="opm-generated-${id}.zip"`,
            },
        });
    } catch {
        const text =
            `Capstone Milestone — Generated Project (placeholder)\n\n` +
            `Source: ${job.filename}\n` +
            `Target stack: ${job.targetStack}\n\n` +
            `The real pipeline will emit a full React + FastAPI + Firebase\n` +
            `project here. This build returns a placeholder so the demo flow\n` +
            `works end-to-end.\n`;
        return new NextResponse(text, {
            headers: {
                "Content-Type": "text/plain",
                "Content-Disposition": `attachment; filename="opm-generated-${id}.txt"`,
            },
        });
    }
}
