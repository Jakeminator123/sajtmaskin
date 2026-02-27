import { and, eq, gt, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { SECRETS } from "@/lib/config";
import { assertDbConfigured } from "./shared";
import type { User } from "./shared";

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
  const now = new Date();
  const existing = await db
    .select()
    .from(users)
    .where(or(eq(users.google_id, googleId), eq(users.email, normalizedEmail)))
    .limit(1);

  if (existing[0]) {
    const rows = await db
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
        updated_at: now,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return rows[0];
  }

  const id = nanoid();
  const rows = await db
    .insert(users)
    .values({
      id,
      email: normalizedEmail,
      name,
      image: picture || null,
      provider: "google",
      google_id: googleId,
      diamonds: 50,
      email_verified: true,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return rows[0];
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

export function isTestUser(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  const email = user.email.toLowerCase();
  if (getAdminEmails().includes(email)) return true;
  return email === SECRETS.testUserEmail || email === SECRETS.superadminEmail;
}

export function isAdminEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return (
    getAdminEmails().includes(lower) ||
    lower === SECRETS.testUserEmail ||
    lower === SECRETS.superadminEmail
  );
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
  await db
    .update(users)
    .set({ diamonds, updated_at: new Date() })
    .where(eq(users.id, userId));
}
