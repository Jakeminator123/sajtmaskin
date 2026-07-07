import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { transactions, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { Transaction } from "./shared";

/**
 * Thrown by {@link createTransaction} when `rejectIfNegative` is set and the
 * debit would drive the balance below zero. Charge-FIRST call sites (e.g. the
 * deploy route) catch this and return 402 before delivering anything, so a
 * raced/insufficient debit can neither overdraft nor become a free delivery.
 */
export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;
  readonly required: number;
  readonly available: number;
  constructor(required: number, available: number) {
    super(`Insufficient credits: need ${required}, have ${available}`);
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.available = available;
  }
}

export async function createTransaction(
  userId: string,
  type: string,
  amount: number,
  description?: string,
  stripePaymentIntent?: string,
  stripeSessionId?: string,
  options?: { rejectIfNegative?: boolean },
): Promise<Transaction> {
  assertDbConfigured();

  // Atomic balance mutation: we lock the user row, recompute the balance
  // against the freshly-locked diamonds value (so concurrent purchases or
  // refunds cannot read-then-stomp each other), then write the user row
  // and the transaction ledger row inside the same transaction.
  return db.transaction(async (tx) => {
    const lockedUsers = await tx
      .select({ diamonds: users.diamonds })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    const lockedUser = lockedUsers[0];
    if (!lockedUser) {
      throw new Error("User not found");
    }

    const currentBalance = lockedUser.diamonds || 0;
    const newBalance = currentBalance + amount;

    // Opt-in guard, evaluated inside the FOR UPDATE lock so two concurrent
    // debits can't both pass on the same balance. Default (undefined) keeps
    // the historical overdraft-tolerant behavior for charge-AFTER call sites,
    // where throwing here would silently drop an already-delivered charge.
    if (options?.rejectIfNegative && newBalance < 0) {
      throw new InsufficientCreditsError(Math.abs(amount), currentBalance);
    }

    const now = new Date();

    await tx
      .update(users)
      .set({ diamonds: newBalance, updated_at: now })
      .where(eq(users.id, userId));

    const id = nanoid();
    const rows = await tx
      .insert(transactions)
      .values({
        id,
        user_id: userId,
        type,
        amount,
        balance_after: newBalance,
        description: description || null,
        stripe_payment_intent: stripePaymentIntent || null,
        stripe_session_id: stripeSessionId || null,
        created_at: now,
      })
      .returning();

    return rows[0];
  });
}

export async function hasSignupBonusTransaction(userId: string): Promise<boolean> {
  assertDbConfigured();
  const rows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.user_id, userId), eq(transactions.type, "signup_bonus")))
    .limit(1);
  return Boolean(rows[0]);
}

export async function getUserTransactions(userId: string, limit = 10): Promise<Transaction[]> {
  assertDbConfigured();
  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.user_id, userId))
    .orderBy(desc(transactions.created_at))
    .limit(limit);
}

export async function getTransactionByStripeSession(
  stripeSessionId: string,
): Promise<Transaction | null> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.stripe_session_id, stripeSessionId))
    .limit(1);
  return rows[0] ?? null;
}
