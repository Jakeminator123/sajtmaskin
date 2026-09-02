import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getCreditCost,
  getCreditDescription,
  getCreditTransactionType,
} from "@/lib/credits/pricing";
import { db } from "@/lib/db/client";
import { transactions, users, wizardRuns } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import { InsufficientCreditsError } from "./transactions";

export const WIZARD_RUN_TTL_MS = 2 * 60 * 60 * 1000;
export const WIZARD_RUN_ACTION = "wizard.enrich" as const;

export type WizardRunStatus = "active" | "completed" | "expired";
export type WizardRun = typeof wizardRuns.$inferSelect;

export type StartedWizardRun = {
  run: WizardRun;
  reused: boolean;
  charged: boolean;
  cost: number;
  balanceAfter: number;
};

export type WizardRunDenial = {
  ok: false;
  status: 403 | 409;
  error: string;
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505",
  );
}

function wizardCost(): number {
  return getCreditCost(WIZARD_RUN_ACTION);
}

async function expireStaleActiveRuns(
  tx: Pick<typeof db, "update">,
  userId: string,
  now: Date,
): Promise<void> {
  await tx
    .update(wizardRuns)
    .set({ status: "expired" })
    .where(
      and(
        eq(wizardRuns.user_id, userId),
        eq(wizardRuns.status, "active"),
        lt(wizardRuns.expires_at, now),
      ),
    );
}

async function findActiveRun(
  tx: Pick<typeof db, "select">,
  userId: string,
): Promise<WizardRun | null> {
  const rows = await tx
    .select()
    .from(wizardRuns)
    .where(and(eq(wizardRuns.user_id, userId), eq(wizardRuns.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

async function startWizardRunOnce(input: {
  userId: string;
  skipCharge?: boolean;
}): Promise<StartedWizardRun> {
  assertDbConfigured();
  const cost = wizardCost();
  const now = new Date();

  return db.transaction(async (tx) => {
    const lockedUsers = await tx
      .select({ diamonds: users.diamonds })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update");
    const lockedUser = lockedUsers[0];
    if (!lockedUser) {
      throw new Error("User not found");
    }

    await expireStaleActiveRuns(tx, input.userId, now);
    const existing = await findActiveRun(tx, input.userId);
    if (existing) {
      return {
        run: existing,
        reused: true,
        charged: false,
        cost,
        balanceAfter: lockedUser.diamonds || 0,
      };
    }

    const currentBalance = lockedUser.diamonds || 0;
    if (!input.skipCharge && currentBalance < cost) {
      throw new InsufficientCreditsError(cost, currentBalance);
    }

    const runId = randomUUID();
    const inserted = await tx
      .insert(wizardRuns)
      .values({
        id: runId,
        user_id: input.userId,
        status: "active",
        created_at: now,
        expires_at: new Date(now.getTime() + WIZARD_RUN_TTL_MS),
      })
      .returning();
    const run = inserted[0];
    if (!run) {
      throw new Error("Failed to create wizard run");
    }

    if (input.skipCharge) {
      return {
        run,
        reused: false,
        charged: false,
        cost,
        balanceAfter: currentBalance,
      };
    }

    const type = getCreditTransactionType(WIZARD_RUN_ACTION);
    const entitled = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.user_id, input.userId),
          eq(transactions.type, type),
          eq(transactions.idempotency_key, run.id),
        ),
      )
      .limit(1);
    if (entitled[0]) {
      return {
        run,
        reused: false,
        charged: false,
        cost,
        balanceAfter: currentBalance,
      };
    }

    const newBalance = currentBalance - cost;
    await tx
      .update(users)
      .set({ diamonds: newBalance, updated_at: now })
      .where(eq(users.id, input.userId));
    await tx.insert(transactions).values({
      id: nanoid(),
      user_id: input.userId,
      type,
      amount: -cost,
      balance_after: newBalance,
      description: getCreditDescription(WIZARD_RUN_ACTION),
      idempotency_key: run.id,
      created_at: now,
    });

    return {
      run,
      reused: false,
      charged: true,
      cost,
      balanceAfter: newBalance,
    };
  });
}

/**
 * Create or resume the caller's single active wizard run and debit 11 credits
 * at most once. Concurrent starts serialize on the user row; the unique
 * active-run index and the transaction idempotency index are the database
 * invariants if that lock is skipped.
 */
export async function startWizardRun(input: {
  userId: string;
  skipCharge?: boolean;
}): Promise<StartedWizardRun> {
  try {
    return await startWizardRunOnce(input);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return startWizardRunOnce(input);
  }
}

export async function requireActiveWizardRun(
  userId: string,
  wizardRunId: string,
): Promise<{ ok: true; run: WizardRun } | WizardRunDenial> {
  assertDbConfigured();
  const id = wizardRunId.trim();
  if (!id) {
    return { ok: false, status: 403, error: "Ogiltig wizard-körning." };
  }

  const rows = await db.select().from(wizardRuns).where(eq(wizardRuns.id, id)).limit(1);
  const run = rows[0];
  if (!run || run.user_id !== userId) {
    return { ok: false, status: 403, error: "Ogiltig wizard-körning." };
  }

  const now = new Date();
  if (run.status === "active" && run.expires_at <= now) {
    await db.update(wizardRuns).set({ status: "expired" }).where(eq(wizardRuns.id, run.id));
    return { ok: false, status: 409, error: "Wizard-körningen har gått ut." };
  }
  if (run.status === "expired") {
    return { ok: false, status: 409, error: "Wizard-körningen har gått ut." };
  }
  if (run.status === "completed") {
    return { ok: false, status: 409, error: "Wizard-körningen är avslutad." };
  }
  if (run.status !== "active") {
    return { ok: false, status: 409, error: "Wizard-körningen är inte aktiv." };
  }

  return { ok: true, run };
}

export async function completeWizardRun(
  userId: string,
  wizardRunId: string,
): Promise<{ ok: true; run: WizardRun } | WizardRunDenial> {
  assertDbConfigured();
  const id = wizardRunId.trim();
  if (!id) {
    return { ok: false, status: 403, error: "Ogiltig wizard-körning." };
  }

  const rows = await db.select().from(wizardRuns).where(eq(wizardRuns.id, id)).limit(1);
  const run = rows[0];
  if (!run || run.user_id !== userId) {
    return { ok: false, status: 403, error: "Ogiltig wizard-körning." };
  }

  const now = new Date();
  if (run.status === "active" && run.expires_at <= now) {
    await db.update(wizardRuns).set({ status: "expired" }).where(eq(wizardRuns.id, run.id));
    return { ok: false, status: 409, error: "Wizard-körningen har gått ut." };
  }
  if (run.status === "expired") {
    return { ok: false, status: 409, error: "Wizard-körningen har gått ut." };
  }
  if (run.status === "completed") {
    return { ok: true, run };
  }
  if (run.status !== "active") {
    return { ok: false, status: 409, error: "Wizard-körningen är inte aktiv." };
  }

  const updated = await db
    .update(wizardRuns)
    .set({ status: "completed" })
    .where(and(eq(wizardRuns.id, run.id), eq(wizardRuns.status, "active")))
    .returning();
  const completed = updated[0];
  if (!completed) {
    return requireActiveWizardRun(userId, id).then((result) =>
      result.ok ? { ok: true, run: result.run } : result,
    );
  }
  return { ok: true, run: completed };
}
