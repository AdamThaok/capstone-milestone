import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const USERNAME = process.env.DEMO_USERNAME || "admin";
const PASSWORD = process.env.DEMO_PASSWORD || "admin";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (username !== USERNAME || password !== PASSWORD) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set("session", "ok", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.json({ ok: true });
}
