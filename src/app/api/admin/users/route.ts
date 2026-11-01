import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminAccess } from "@/lib/auth/admin";
import { BillingRetentionError } from "@/lib/db/billing-retention-guard";
import {
  AdminUserError,
  createAdminUser,
  createAdminUserSchema,
  deleteAdminUser,
  deleteAdminUserSchema,
  grantAdminCredits,
  grantAdminCreditsSchema,
  listAdminUsers,
} from "@/lib/db/services/admin-users";

export const runtime = "nodejs";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(error: unknown) {
  if (error instanceof ZodError) {
    return reply({ success: false, error: error.issues[0]?.message ?? "Ogiltiga uppgifter." }, 400);
  }
  if (error instanceof AdminUserError)
    return reply({ success: false, error: error.message }, error.status);
  if (error instanceof BillingRetentionError)
    return reply({ success: false, error: error.message }, 409);
  let cause = error;
  for (let depth = 0; depth < 3 && cause && typeof cause === "object"; depth++) {
    if ("code" in cause && cause.code === "23505") {
      return reply({ success: false, error: "Kontot finns redan. Sök upp det i listan." }, 409);
    }
    if ("code" in cause && cause.code === "23503") {
      return reply(
        {
          success: false,
          error: "Kontot används fortfarande och kunde inte raderas. Inget raderades.",
        },
        409,
      );
    }
    cause = "cause" in cause ? cause.cause : null;
  }
  // Database errors may contain the password hash or supplied values; do not log raw errors.
  console.error("[admin/users] Operation failed");
  return reply({ success: false, error: "Åtgärden kunde inte genomföras. Försök igen." }, 500);
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0)
    return reply({ success: false, error: "Ogiltig sida." }, 400);
  try {
    return reply({ success: true, ...(await listAdminUsers(query, offset, admin.user.id)) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;
  try {
    const input = createAdminUserSchema.parse(await req.json().catch(() => null));
    const user = await createAdminUser(input, admin.user.id);
    return reply({ success: true, user }, 201);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;
  try {
    const input = grantAdminCreditsSchema.parse(await req.json().catch(() => null));
    const transaction = await grantAdminCredits(input, admin.user.id);
    return reply({ success: true, credits: transaction.balance_after });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) return admin.response;
  try {
    const input = deleteAdminUserSchema.parse(await req.json().catch(() => null));
    await deleteAdminUser(input, admin.user.id);
    return reply({ success: true });
  } catch (error) {
    return failure(error);
  }
}
