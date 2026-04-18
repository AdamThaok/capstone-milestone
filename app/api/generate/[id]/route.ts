import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getJob } from "@/lib/pipeline/jobs";

export async function GET(
    _req: Request,
    ctx: { params: Promise<{ id: string }> },
) {
    const jar = await cookies();
    if (jar.get("session")?.value !== "ok")
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const job = getJob(id);
    if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

    return NextResponse.json(job);
}
