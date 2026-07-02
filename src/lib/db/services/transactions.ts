import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { transactions, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { Transaction } from "./shared";

/**
 * Thrown when a debit (negative amount) cannot be applied because the
 * freshly-locked balance does not cover it. Callers can catch this to surface
 * a "not enough credits" state instead of writing a negative balance.
 */
export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS";
  readonly balance: number;
  readonly required: number;
  constructor(balance: number, amount: number) {
    super(`Insufficient credits: balance ${balance}, attempted debit ${-amount}`);
    this.name = "InsufficientCreditsError";
    this.balance = balance;
    this.required = -amount;
  }
}

export async function createTransaction(
  userId: string,
  type: string,
  amount: number,
  description?: string,
  stripePaymentIntent?: string,
  stripeSessionId?: string,
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

    // Authoritative debit guard. The pre-check in evaluateCredits() reads the
    // balance without a lock, so two parallel debits can both pass it. Here we
    // hold the row lock, so only one debit can win: reject any debit that would
    // drive the locked balance negative instead of stomping it below zero.
    // Credits/refunds (amount >= 0) are never blocked.
    if (amount < 0 && newBalance < 0) {
      throw new InsufficientCreditsError(currentBalance, amount);
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
