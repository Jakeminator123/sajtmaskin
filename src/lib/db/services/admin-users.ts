import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/auth";
import { isAdminEmailEdge } from "@/lib/auth/edge-auth";
import { assertNoProtectedBillingRows } from "@/lib/db/billing-retention-guard";
import { db } from "@/lib/db/client";
import { appProjects, transactions, users } from "@/lib/db/schema";
import { TEST_USER_EMAIL } from "./shared";
import { createTransaction } from "./transactions";

const email = z.string().trim().toLowerCase().email().max(254);
const credits = z.number().int().min(0).max(100_000);
export const createAdminUserSchema = z
  .object({
    email,
    name: z.string().trim().max(120).optional(),
    password: z.string().min(6, "Lösenordet måste vara minst 6 tecken.").max(256),
    credits,
  })
  .strict();
export const grantAdminCreditsSchema = z
  .object({
    userId: z.string().min(1).max(100),
    amount: credits.refine((value) => value > 0),
    requestId: z.string().uuid(),
  })
  .strict();
export const deleteAdminUserSchema = z
  .object({
    userId: z.string().min(1).max(100),
    confirmEmail: email,
  })
  .strict();

export class AdminUserError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminUserError";
  }
}

export function userDeletionProtection(
  user: { id: string; email: string },
  actorId: string,
): string | null {
  if (user.id === actorId) return "Du kan inte radera ditt eget konto.";
  if (isAdminEmailEdge(user.email)) return "Administratörskonton skyddas mot radering.";
  if (TEST_USER_EMAIL && user.email.toLowerCase() === TEST_USER_EMAIL.toLowerCase()) {
    return "Det konfigurerade systemtestkontot skyddas mot radering.";
  }
  return null;
}

export async function listAdminUsers(query: string, offset: number, actorId: string) {
  // Explicit projection: password hashes, verification and OAuth tokens never leave this service.
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      provider: users.provider,
      credits: users.diamonds,
      emailVerified: users.email_verified,
      freeGenerationAvailable: users.free_generation_available,
      createdAt: users.created_at,
      lastLoginAt: users.last_login_at,
      projectCount: sql<number>`(SELECT count(*)::int FROM ${appProjects} WHERE ${appProjects.user_id} = ${users.id})`,
    })
    .from(users)
    .where(
      query ? or(ilike(users.email, `%${escaped}%`), ilike(users.name, `%${escaped}%`)) : undefined,
    )
    .orderBy(desc(users.created_at), desc(users.id))
    .limit(26)
    .offset(offset);
  return {
    users: rows.slice(0, 25).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      deletionProtection: userDeletionProtection(row, actorId),
    })),
    hasMore: rows.length > 25,
    offset,
  };
}

export type AdminUsersPayload = Awaited<ReturnType<typeof listAdminUsers>>;

export async function createAdminUser(
  input: z.infer<typeof createAdminUserSchema>,
  actorId: string,
) {
  const parsed = createAdminUserSchema.parse(input);
  if (isAdminEmailEdge(parsed.email) || parsed.email.endsWith(".invalid")) {
    throw new AdminUserError("Den e-postadressen är reserverad för systemkonton.", 400);
  }
  const passwordHash = hashPassword(parsed.password);
  const id = nanoid();
  const now = new Date();
  // Account and initial balance ledger commit together. A duplicate email cannot receive a second grant.
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id,
      email: parsed.email,
      name: parsed.name || null,
      provider: "email",
      password_hash: passwordHash,
      diamonds: parsed.credits,
      email_verified: true,
      free_generation_available: false,
      created_at: now,
      updated_at: now,
    });
    if (parsed.credits > 0) {
      await tx.insert(transactions).values({
        id: nanoid(),
        user_id: id,
        type: "admin_credit",
        amount: parsed.credits,
        balance_after: parsed.credits,
        description: `Startsaldo tilldelat av admin ${actorId}`,
        idempotency_key: `admin-create:${id}`,
        created_at: now,
      });
    }
  });
  return { id, email: parsed.email, credits: parsed.credits };
}

export async function grantAdminCredits(
  input: z.infer<typeof grantAdminCreditsSchema>,
  actorId: string,
) {
  const parsed = grantAdminCreditsSchema.parse(input);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, parsed.userId))
    .limit(1);
  if (!user) throw new AdminUserError("Användaren finns inte.", 404);
  const grant = await createTransaction(
    parsed.userId,
    "admin_credit",
    parsed.amount,
    `Krediter tilldelade av admin ${actorId}`,
    undefined,
    undefined,
    { idempotencyKey: `admin-grant:${parsed.requestId}` },
  );
  if (grant.amount !== parsed.amount) {
    throw new AdminUserError(
      "Begäran är redan bokförd med ett annat belopp. Stäng dialogen och kontrollera saldot.",
      409,
    );
  }
  return grant;
}

export async function deleteAdminUser(
  input: z.infer<typeof deleteAdminUserSchema>,
  actorId: string,
) {
  const parsed = deleteAdminUserSchema.parse(input);
  await assertNoProtectedBillingRows("Raderingen", { kind: "userIds", userIds: [parsed.userId] });
  await db.transaction(async (tx) => {
    // app_projects has no user FK. Serialize its writes during this short delete
    // so a concurrent project creation cannot leave an orphaned project owner.
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`LOCK TABLE app_projects IN SHARE MODE`);
    const [user] = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, parsed.userId))
      .for("update");
    if (!user) throw new AdminUserError("Användaren finns inte.", 404);
    const protection = userDeletionProtection(user, actorId);
    if (protection) throw new AdminUserError(protection, 409);
    if (user.email.toLowerCase() !== parsed.confirmEmail) {
      throw new AdminUserError("Bekräftelsen matchar inte kontots e-postadress.", 400);
    }
    const [project] = await tx
      .select({ id: appProjects.id })
      .from(appProjects)
      .where(eq(appProjects.user_id, user.id))
      .limit(1);
    if (project)
      throw new AdminUserError("Kontot har projekt. Flytta eller radera dem först.", 409);
    const [payment] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.user_id, user.id),
          or(
            isNotNull(transactions.stripe_payment_intent),
            isNotNull(transactions.stripe_session_id),
          ),
        ),
      )
      .limit(1);
    if (payment)
      throw new AdminUserError("Kontot har betalningshistorik och kan inte raderas här.", 409);
    await tx.delete(users).where(eq(users.id, user.id));
  });
}
