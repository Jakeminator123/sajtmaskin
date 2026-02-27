import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { transactions, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { Transaction } from "./shared";
import { getUserById } from "./users";

export async function createTransaction(
  userId: string,
  type: string,
  amount: number,
  description?: string,
  stripePaymentIntent?: string,
  stripeSessionId?: string,
): Promise<Transaction> {
  assertDbConfigured();
  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const newBalance = (user.diamonds || 0) + amount;
  const now = new Date();

  await db.update(users).set({ diamonds: newBalance, updated_at: now }).where(eq(users.id, userId));

  const id = nanoid();
  const rows = await db
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
