import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { identifier } from "../../cable";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const userId = body?.userId;
  const name = body?.name;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const token = await identifier.issue({ sub: userId, name });

  cookies().set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}
