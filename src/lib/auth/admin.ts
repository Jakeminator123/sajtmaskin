import { NextResponse } from "next/server";
import { getCurrentUser, getCurrentUserFromCookies } from "@/lib/auth/auth";
import { isAdminEmailEdge } from "@/lib/auth/edge-auth";
import type { User } from "@/lib/db/services/shared";

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

/**
 * Server Component variant of {@link requireAdminAccess}: resolves the signed-in
 * user from the auth cookie and returns it only when the email is an admin.
 *
 * Uses the exact same admin predicate (`isAdminEmailEdge`) as the API guard and
 * the `/admin` proxy gate, so page shell and data access can never disagree.
 * Returns `null` instead of a response — the caller decides (redirect/render).
 */
export async function getAdminUserForPage(): Promise<User | null> {
  let user: User | null = null;

  try {
    user = await getCurrentUserFromCookies();
  } catch (error) {
    console.error("[auth/admin] Failed to resolve admin page user:", error);
    return null;
  }

  if (!user?.email || !isAdminEmailEdge(user.email)) {
    return null;
  }

  return user;
}
