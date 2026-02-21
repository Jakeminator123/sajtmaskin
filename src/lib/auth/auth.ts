/**
 * Authentication utilities
 *
 * Handles JWT tokens, password hashing, and session management.
 */

import crypto from "crypto";
import { cookies } from "next/headers";
import {
  getUserById,
  getUserByEmail,
  createUser,
  createGoogleUser,
  updateUserLastLogin,
  isAdminEmail,
  setUserDiamonds,
  markEmailVerified,
  type User,
} from "@/lib/db/services";
import { SECRETS, URLS, IS_PRODUCTION } from "@/lib/config";

/** Default diamond balance for admin/superuser accounts. */
const ADMIN_DIAMONDS = Number(process.env.SUPERADMIN_DIAMONDS) || 10_000;

// ============ Password Hashing ============

/**
 * Hash a password using crypto scrypt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const testHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === testHash;
}

// JWT configuration - use centralized secrets
const JWT_SECRET = SECRETS.jwtSecret;
const JWT_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const AUTH_COOKIE_NAME = "sajtmaskin_auth";

// Google OAuth configuration - use centralized secrets
const GOOGLE_CLIENT_ID = SECRETS.googleClientId;
const GOOGLE_CLIENT_SECRET = SECRETS.googleClientSecret;
const GOOGLE_REDIRECT_URI = URLS.googleCallbackUrl;

// ============ JWT Token Management ============

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Create a simple JWT token (base64 encoded JSON with HMAC signature)
 * Note: For production, consider using jose library for proper JWT
 */
export function createToken(userId: string, email: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY,
  };

  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as JWTPayload;

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ============ Cookie Management ============

/**
 * Set auth cookie with JWT token
 */
export async function setAuthCookie(token: string, options?: { secure?: boolean }): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: typeof options?.secure === "boolean" ? options.secure : IS_PRODUCTION,
    sameSite: "lax",
    path: "/",
    maxAge: JWT_EXPIRY,
  });
}

/**
 * Get auth token from cookie
 */
export async function getAuthCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value || null;
}

/**
 * Clear auth cookie (logout)
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Get auth token from request headers (for API routes)
 */
export function getTokenFromRequest(request: Request): string | null {
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Check cookie header
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const equalIndex = cookie.indexOf("=");
      if (equalIndex === -1) continue;
      const name = cookie.substring(0, equalIndex);
      const value = cookie.substring(equalIndex + 1);
      if (name === AUTH_COOKIE_NAME) {
        return value;
      }
    }
  }

  return null;
}

// ============ User Authentication ============

/**
 * Get current authenticated user from request
 */
export async function getCurrentUser(request: Request): Promise<User | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await getUserById(payload.userId);
  return user;
}

/**
 * Register a new user with email/password
 */
export async function registerUser(
  email: string,
  password: string,
  name?: string,
): Promise<{ user: User; token: string } | { error: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return { error: "Ogiltig e-postadress" };
  }

  // Validate password
  if (password.length < 6) {
    return { error: "Lösenordet måste vara minst 6 tecken" };
  }

  // Check if user exists
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return { error: "En användare med denna e-post finns redan" };
  }

  // Create user
  const passwordHash = hashPassword(password);
  const user = await createUser(normalizedEmail, passwordHash, name);

  // Create token
  const token = createToken(user.id, user.email!);

  return { user, token };
}

/**
 * Parse admin credentials from ADMIN_CREDENTIALS env var.
 * Format: "login:password:email:name,login2:password2:email2:name2"
 *
 * Also supports simpler fallback credentials from:
 * - SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD
 * - TEST_USER_EMAIL + TEST_USER_PASSWORD
 */
function getAdminCredentials(): Array<{
  login: string;
  password: string;
  email: string;
  name: string;
}> {
  const raw = process.env.ADMIN_CREDENTIALS || "";
  const parsed = raw
    .split(",")
    .map((entry) => {
      const [login, password, email, name] = entry.split(":");
      return {
        login: (login || "").trim(),
        password: (password || "").trim(),
        email: (email || login || "").trim(),
        name: (name || login || "").trim(),
      };
    })
    .filter((item) => item.login && item.password && item.email);

  const fallback: Array<{ login: string; password: string; email: string; name: string }> = [];

  if (SECRETS.superadminEmail && SECRETS.superadminPassword) {
    fallback.push({
      login: SECRETS.superadminEmail,
      password: SECRETS.superadminPassword,
      email: SECRETS.superadminEmail,
      name: "Superadmin",
    });
  }

  if (SECRETS.testUserEmail && SECRETS.testUserPassword) {
    fallback.push({
      login: SECRETS.testUserEmail,
      password: SECRETS.testUserPassword,
      email: SECRETS.testUserEmail,
      name: "Test user",
    });
  }

  const byEmail = new Map<string, { login: string; password: string; email: string; name: string }>();
  [...parsed, ...fallback].forEach((cred) => {
    if (!byEmail.has(cred.email.toLowerCase())) {
      byEmail.set(cred.email.toLowerCase(), cred);
    }
  });

  return [...byEmail.values()];
}

function matchesAdminCredentialPassword(expected: string, provided: string): boolean {
  if (expected === provided) return true;
  if (IS_PRODUCTION) return false;

  const safeExpected = expected.trim();
  const safeProvided = provided.trim();
  if (!safeExpected || !safeProvided) return false;

  // Local dev fallback: allow legacy-shortened admin passwords.
  if (safeExpected.startsWith(safeProvided) && safeProvided.length >= 8) return true;

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedExpected = normalize(safeExpected);
  const normalizedProvided = normalize(safeProvided);
  return (
    normalizedProvided.length >= 8 &&
    (normalizedExpected === normalizedProvided ||
      normalizedExpected.startsWith(normalizedProvided))
  );
}

/**
 * Login user with email/password.
 * Checks env-configured admin credentials first, then falls back to database lookup.
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: User; token: string } | { error: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  // Check admin credentials from env
  const adminCreds = getAdminCredentials();
  const adminMatch = adminCreds.find(
    (u) =>
      (u.login.toLowerCase() === normalizedEmail || u.email.toLowerCase() === normalizedEmail) &&
      matchesAdminCredentialPassword(u.password, password),
  );

  if (adminMatch) {
    // Ensure the admin user exists in the database
    let user = await getUserByEmail(adminMatch.email);
    if (!user) {
      const result = await registerUser(adminMatch.email, adminMatch.password, adminMatch.name);
      if ("error" in result) {
        return { error: result.error };
      }
      user = result.user;
    }
    // Bootstrap admin privileges: 10k diamonds + auto-verify email
    await bootstrapAdminUser(user);
    await updateUserLastLogin(user.id);
    const hydratedUser = (await getUserById(user.id)) ?? user;
    const token = createToken(hydratedUser.id, hydratedUser.email!);
    return { user: hydratedUser, token };
  }

  // Standard database login
  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    return { error: "Felaktig e-post eller lösenord" };
  }

  if (!user.password_hash) {
    return { error: "Detta konto använder Google-inloggning" };
  }

  if (!verifyPassword(password, user.password_hash)) {
    return { error: "Felaktig e-post eller lösenord" };
  }

  const isAdmin = isAdminEmail(user.email || normalizedEmail);

  // Bootstrap admin privileges on regular login too (for ADMIN_EMAILS users)
  if (isAdmin) {
    await bootstrapAdminUser(user);
  }

  // Enforce email verification for regular email/password users.
  if (!isAdmin && !user.email_verified) {
    return {
      error:
        "Du måste bekräfta din e-post innan du kan logga in. Använd 'Skicka verifieringsmail igen' i inloggningsrutan.",
    };
  }

  // Update last login
  await updateUserLastLogin(user.id);

  // Create token
  const hydratedUser = (await getUserById(user.id)) ?? user;
  const token = createToken(hydratedUser.id, hydratedUser.email!);

  return { user: hydratedUser, token };
}

// ============ Admin Bootstrap ============

/**
 * Ensures an admin/superuser account has:
 * - 10 000 diamonds (or env SUPERADMIN_DIAMONDS) for testing
 * - Email auto-verified
 *
 * Ensures admins always have a high testing balance. Works in both
 * local and production.
 */
async function bootstrapAdminUser(user: User): Promise<void> {
  try {
    if (user.diamonds < ADMIN_DIAMONDS) {
      await setUserDiamonds(user.id, ADMIN_DIAMONDS);
    }
    if (!user.email_verified) {
      await markEmailVerified(user.id);
    }
  } catch (err) {
    // Non-fatal – log and continue
    console.error("[Auth] Failed to bootstrap admin user:", err);
  }
}

// ============ Google OAuth ============

/**
 * Get Google OAuth authorization URL
 */
export function getGoogleAuthUrl(state?: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback",
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGoogleCode(
  code: string,
): Promise<{ accessToken: string; idToken: string } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error("[Auth] Google OAuth not configured");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback",
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      console.error("[Auth] Google token exchange failed:", await response.text());
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      idToken: data.id_token,
    };
  } catch (error) {
    console.error("[Auth] Google token exchange error:", error);
    return null;
  }
}

/**
 * Get Google user info from access token
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
} | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error("[Auth] Failed to get Google user info");
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
      emailVerified: data.verified_email === true,
    };
  } catch (error) {
    console.error("[Auth] Google user info error:", error);
    return null;
  }
}

/**
 * Handle Google OAuth callback - create or update user
 */
export async function handleGoogleCallback(
  code: string,
): Promise<{ user: User; token: string } | { error: string }> {
  // Exchange code for tokens
  const tokens = await exchangeGoogleCode(code);
  if (!tokens) {
    return { error: "Kunde inte verifiera med Google" };
  }

  // Get user info
  const googleUser = await getGoogleUserInfo(tokens.accessToken);
  if (!googleUser) {
    return { error: "Kunde inte hämta användarinfo från Google" };
  }

  if (!googleUser.emailVerified) {
    return { error: "E-postadressen är inte verifierad hos Google. Verifiera den i ditt Google-konto och försök igen." };
  }

  // Create or update user
  const user = await createGoogleUser(
    googleUser.id,
    googleUser.email,
    googleUser.name,
    googleUser.picture,
  );

  // Google-authenticated emails are inherently verified; mark as such.
  // Also bootstrap admin privileges if applicable.
  if (!user.email_verified) {
    await markEmailVerified(user.id);
  }
  if (isAdminEmail(googleUser.email)) {
    await bootstrapAdminUser(user);
  }

  // Update last login
  await updateUserLastLogin(user.id);

  // Create token using fresh row (may include updated diamonds/verification)
  const hydratedUser = (await getUserById(user.id)) ?? user;
  const token = createToken(hydratedUser.id, hydratedUser.email!);

  return { user: hydratedUser, token };
}

// ============ Type exports ============

export type { User };
