import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { clearUserGitHub } from "@/lib/db/services";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await clearUserGitHub(user.id);

  return NextResponse.json({ success: true });
}
