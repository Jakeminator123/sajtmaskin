/**
 * "Glömt lösenord?" — livscykel för engångslänkar.
 *
 * - Token: 32 slumpbyte (base64url). Bara sha256-hashen lagras.
 * - Tidsbegränsad: {@link PASSWORD_RESET_TOKEN_TTL_MS}.
 * - Enkel användning: inlösen sätter `used_at` villkorat på att raden är
 *   oanvänd och giltig, i samma transaktion som lösenordet byts. Därefter tas
 *   kontots alla rader bort.
 * - En aktiv länk per konto: en ny begäran ersätter äldre rader. Inom
 *   {@link PASSWORD_RESET_RESEND_COOLDOWN_MS} skapas ingen ny länk alls, så en
 *   adress inte kan mejlbombas.
 */

import { createHash, randomBytes } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
export const MAX_PASSWORD_RESET_TOKEN_LENGTH = 256;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Ny token + det som sparas. Ren funktion så livslängden kan testas utan DB. */
export function issuePasswordResetToken(now: Date = new Date()): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}

function isUsableToken(token: string): boolean {
  return token.length > 0 && token.length <= MAX_PASSWORD_RESET_TOKEN_LENGTH;
}

/**
 * Skapar en ny länk för kontot och ersätter äldre. Returnerar `null` om en
 * länk skapades nyss (cooldown) — anroparen svarar då likadant utan att mejla.
 */
export async function createPasswordResetToken(
  userId: string,
  now: Date = new Date(),
): Promise<string | null> {
  assertDbConfigured();
  const cooldownStart = new Date(now.getTime() - PASSWORD_RESET_RESEND_COOLDOWN_MS);
  const issued = issuePasswordResetToken(now);

  return db.transaction(async (tx) => {
    const recent = await tx
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.createdAt, cooldownStart),
        ),
      )
      .limit(1);
    if (recent.length > 0) return null;

    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.insert(passwordResetTokens).values({
      id: nanoid(),
      userId,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      createdAt: now,
    });
    return issued.token;
  });
}

/** Läser utan att förbruka: finns en oanvänd, giltig länk för token? */
export async function findUsablePasswordResetToken(
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string; expiresAt: Date } | null> {
  if (!isUsableToken(token)) return null;
  assertDbConfigured();
  const rows = await db
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashPasswordResetToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Löser in länken och byter lösenord atomiskt. Returnerar kontots id, eller
 * `null` om länken är okänd, använd eller utgången (även vid samtidig inlösen:
 * bara en vinner villkoret `used_at IS NULL`).
 *
 * Länken bevisar att mottagaren äger adressen, så kontot markeras också som
 * verifierat och en eventuell öppen verifieringslänk stängs.
 */
export async function consumePasswordResetToken(
  token: string,
  passwordHash: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!isUsableToken(token)) return null;
  assertDbConfigured();
  const tokenHash = hashPasswordResetToken(token);

  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    const userId = claimed[0]?.userId;
    if (!userId) return null;

    await tx
      .update(users)
      .set({
        password_hash: passwordHash,
        email_verified: true,
        verification_token: null,
        verification_token_expires: null,
        updated_at: now,
      })
      .where(eq(users.id, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    return userId;
  });
}
