import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { clearUserGitHub } from "@/lib/data/database";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  clearUserGitHub(user.id);

  return NextResponse.json({ success: true });
}
