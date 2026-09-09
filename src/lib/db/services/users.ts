import { and, eq, gt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { SECRETS } from "@/lib/config";
import { assertDbConfigured } from "./shared";
import type { User } from "./shared";

function isUniqueViolation(error: unknown): boolean {
  let candidate = error;
  // DrizzleQueryError stores the PostgreSQL error on `cause`. Keep traversal
  // bounded so malformed or cyclic error objects cannot turn retry handling
  // into an unbounded walk.
  for (let depth = 0; depth < 3; depth += 1) {
    if (!candidate || typeof candidate !== "object") return false;
    if ("code" in candidate && candidate.code === "23505") return true;
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}

export async function getUserById(id: string): Promise<User | null> {
  assertDbConfigured();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  assertDbConfigured();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  passwordHash: string,
  name?: string,
): Promise<User> {
  assertDbConfigured();
  const normalizedEmail = email.trim().toLowerCase();
  const id = nanoid();
  const now = new Date();
  const rows = await db
    .insert(users)
    .values({
      id,
      email: normalizedEmail,
      password_hash: passwordHash,
      name: name || null,
      provider: "email",
      diamonds: 0,
      free_generation_available: true,
      email_verified: false,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
}

export async function createGoogleUser(
  googleId: string,
  email: string,
  name: string,
  picture?: string,
): Promise<User> {
  assertDbConfigured();
  const normalizedEmail = email.trim().toLowerCase();

  const linkGoogleIdentity = () =>
    db.transaction(async (tx) => {
      // The email index protects new rows, but google_id has no database unique
      // constraint. Transaction-scoped advisory locks serialize both identities,
      // including the no-row-yet case. Sorting keeps concurrent links from
      // acquiring the two locks in opposite order.
      const identityLocks = [`users:email:${normalizedEmail}`, `users:google:${googleId}`].sort();
      for (const identity of identityLocks) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`);
      }

      const matches = await tx
        .select()
        .from(users)
        .where(or(eq(users.google_id, googleId), eq(users.email, normalizedEmail)))
        .for("update");

      // Refuse to merge two rows or replace a different Google subject. Either
      // case is an identity conflict that needs explicit account recovery.
      if (matches.length > 1 || (matches[0]?.google_id && matches[0].google_id !== googleId)) {
        throw new Error("Google identity conflicts with an existing account");
      }

      const now = new Date();
      const existing = matches[0];
      if (existing) {
        const rows = await tx
          .update(users)
          .set({
            google_id: googleId,
            email: normalizedEmail,
            name,
            image: picture || null,
            provider: "google",
            email_verified: true,
            verification_token: null,
            verification_token_expires: null,
            // An unverified registration has not proved ownership. Its secret
            // must not become usable merely because Google verifies the email.
            ...(existing.email_verified ? {} : { password_hash: null }),
            updated_at: now,
          })
          .where(eq(users.id, existing.id))
          .returning();
        return rows[0];
      }

      const id = nanoid();
      const rows = await tx
        .insert(users)
        .values({
          id,
          email: normalizedEmail,
          name,
          image: picture || null,
          provider: "google",
          google_id: googleId,
          diamonds: 0,
          free_generation_available: true,
          email_verified: true,
          created_at: now,
          updated_at: now,
        })
        .returning();
      return rows[0];
    });

  // A plain email registration can commit after the locked lookup but before
  // our insert. Its unique-email violation aborts the transaction; one retry
  // then locks and links that row under the same verification rule.
  try {
    return await linkGoogleIdentity();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return linkGoogleIdentity();
  }
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ last_login_at: new Date(), updated_at: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserGitHub(
  userId: string,
  accessToken: string,
  username: string,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ github_token: accessToken, github_username: username, updated_at: new Date() })
    .where(eq(users.id, userId));
}

export async function clearUserGitHub(userId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({ github_token: null, github_username: null, updated_at: new Date() })
    .where(eq(users.id, userId));
}

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getPrivilegedEnvEmails(): string[] {
  return [SECRETS.testUserEmail, SECRETS.superadminEmail]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isTestUser(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  return isAdminEmail(user.email);
}

export function isAdminEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (!lower) return false;
  return getAdminEmails().includes(lower) || getPrivilegedEnvEmails().includes(lower);
}

// --- Email verification ---

const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createVerificationToken(userId: string): Promise<string> {
  assertDbConfigured();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(token);
  const expires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await db
    .update(users)
    .set({
      verification_token: tokenHash,
      verification_token_expires: expires,
      updated_at: new Date(),
    })
    .where(eq(users.id, userId));

  return token;
}

export async function getUserByVerificationToken(token: string): Promise<User | null> {
  assertDbConfigured();
  const tokenHash = hashVerificationToken(token);
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        or(eq(users.verification_token, tokenHash), eq(users.verification_token, token)),
        gt(users.verification_token_expires, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  assertDbConfigured();
  await db
    .update(users)
    .set({
      email_verified: true,
      verification_token: null,
      verification_token_expires: null,
      updated_at: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function setUserDiamonds(userId: string, diamonds: number): Promise<void> {
  assertDbConfigured();
  await db.update(users).set({ diamonds, updated_at: new Date() }).where(eq(users.id, userId));
}
