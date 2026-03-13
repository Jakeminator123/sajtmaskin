import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { isAdminEmailEdge } from "@/lib/auth/edge-auth";

type AdminAccessResult =
  | {
      ok: true;
      user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAdminAccess(request: Request): Promise<AdminAccessResult> {
  let user: Awaited<ReturnType<typeof getCurrentUser>> | null = null;

  try {
    user = await getCurrentUser(request);
  } catch (error) {
    console.error("[auth/admin] Failed to resolve current user:", error);
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Admin auth is temporarily unavailable" },
        { status: 503 },
      ),
    };
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!user.email || !isAdminEmailEdge(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
