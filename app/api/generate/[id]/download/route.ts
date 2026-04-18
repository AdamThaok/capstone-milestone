import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getJob } from "@/lib/pipeline/jobs";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { PassThrough } from "node:stream";

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

    // Prefer the real generated project directory when present
    if (job.outputDir) {
        try {
            const stat = await fsp.stat(job.outputDir);
            if (stat.isDirectory()) {
                const pass = new PassThrough();
                const zip  = archiver("zip", { zlib: { level: 9 } });
                zip.on("error", (e) => pass.destroy(e));
                zip.pipe(pass);
                zip.directory(job.outputDir, false);
                zip.finalize();

                return new NextResponse(pass as unknown as BodyInit, {
                    headers: {
                        "Content-Type":        "application/zip",
                        "Content-Disposition": `attachment; filename="opm-generated-${id}.zip"`,
                    },
                });
            }
        } catch { /* fall through to mock */ }
    }

    // Fallback: static scaffold bundled in public/mock-outputs.
    const zipPath = path.join(process.cwd(), "public", "mock-outputs", "generated-project.zip");
    try {
        const buf = await fsp.readFile(zipPath);
        return new NextResponse(buf as unknown as BodyInit, {
            headers: {
                "Content-Type":        "application/zip",
                "Content-Disposition": `attachment; filename="opm-generated-${id}.zip"`,
            },
        });
    } catch {
        const text =
            `Capstone Milestone — Generated Project (placeholder)\n\n` +
            `Source: ${job.filename}\n` +
            `Target stack: ${job.targetStack}\n`;
        return new NextResponse(text, {
            headers: {
                "Content-Type":        "text/plain",
                "Content-Disposition": `attachment; filename="opm-generated-${id}.txt"`,
            },
        });
    }
    // silence unused import
    void fs;
}
