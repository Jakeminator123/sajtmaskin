/**
 * Authentication utilities
 *
 * Handles JWT tokens, password hashing, and session management.
 */

import crypto from "crypto";
import { cookies, headers } from "next/headers";
import {
  createGoogleUser,
  createUser,
  getUserByEmail,
  getUserById,
  isAdminEmail,
  markEmailVerified,
  setUserDiamonds,
  updateUserLastLogin,
} from "@/lib/db/services/users";
import type { User } from "@/lib/db/services/shared";
import { SECRETS, URLS, IS_PRODUCTION } from "@/lib/config";
import {
  AUTH_COOKIE_HOST_NAME,
  AUTH_COOKIE_LEGACY_NAME,
  authCookieWriteName,
  cookieMapFromList,
  expireCookieSetOptions,
  expireLeftoverCookieOptions,
  forwardedProtoIsHttps,
  getAuthTokenFromRequest,
  hostCookieSetOptions,
  parseCookieHeader,
  pickHostOrLegacyCookie,
} from "@/lib/auth/host-cookies";

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

// Google OAuth configuration - use centralized secrets
const GOOGLE_CLIENT_ID = SECRETS.googleClientId;
const GOOGLE_CLIENT_SECRET = SECRETS.googleClientSecret;
const GOOGLE_REDIRECT_URI = URLS.googleCallbackUrl;
const DEFAULT_GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/google/callback";

function resolveGoogleRedirectUri(override?: string): string {
  const candidate = override?.trim();
  if (candidate) return candidate;
  if (GOOGLE_REDIRECT_URI) return GOOGLE_REDIRECT_URI;
  return DEFAULT_GOOGLE_REDIRECT_URI;
}

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

function resolveAuthCookieSecure(options?: { secure?: boolean }): boolean {
  return typeof options?.secure === "boolean" ? options.secure : IS_PRODUCTION;
}

type IncomingHeaderList = { get(name: string): string | null };

/** `headers()`, or null in the unit-test mocks / render phases where it throws. */
async function incomingHeaders(): Promise<IncomingHeaderList | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

/**
 * HTTPS cookie policy for a request that has no `Request` object. The write side
 * uses `IS_PRODUCTION`, so `OR` here can only make the reader stricter than the
 * writer — never laxer, which would re-open the leftover as an identity.
 */
function secureCookiePolicy(headerList: IncomingHeaderList | null): boolean {
  return (
    resolveAuthCookieSecure() ||
    forwardedProtoIsHttps(headerList?.get("x-forwarded-proto"))
  );
}

/** Request host for the parent-`Domain` clears, or null when unavailable. */
function requestHostFromHeaders(headerList: IncomingHeaderList | null): string | null {
  return (
    headerList?.get("host") ?? headerList?.get("x-forwarded-host") ?? null
  );
}

/**
 * The raw `Cookie` header is the only view that still shows two cookies sharing
 * a name — `cookies()` has already collapsed them. So a successful header read
 * is authoritative, including when it refuses: falling through to `cookies()`
 * would let the lossy parser hand back one of the conflicting values anyway.
 * `cookies()` is a fallback only for the case where `headers()` is unavailable.
 */
async function readAuthTokenFromIncomingCookies(): Promise<string | null> {
  const headerList = await incomingHeaders();
  const secure = secureCookiePolicy(headerList);

  if (headerList) {
    return (
      pickHostOrLegacyCookie(
        parseCookieHeader(headerList.get("cookie")),
        AUTH_COOKIE_HOST_NAME,
        AUTH_COOKIE_LEGACY_NAME,
        { secure },
      )?.value ?? null
    );
  }

  const cookieStore = await cookies();
  const list =
    typeof cookieStore.getAll === "function" ? cookieStore.getAll() : [];
  return (
    pickHostOrLegacyCookie(
      cookieMapFromList(list),
      AUTH_COOKIE_HOST_NAME,
      AUTH_COOKIE_LEGACY_NAME,
      { secure },
    )?.value ?? null
  );
}

/**
 * Set auth cookie with JWT token.
 * `__Host-` is used only when `Secure` is on — browsers reject `__Host-` without it.
 *
 * Writes auth cookies only. A login proves the *account*; it says nothing about
 * who wrote a leftover `sajtmaskin_session` cookie or whether that session's
 * projects belong to this user. A subdomain on `Domain=.sajtmaskin.se` can plant
 * a known `sess_` id, so claiming from it here would let a plantable cookie
 * transfer `app_projects` ownership permanently — expiring the cookie afterwards
 * does not undo a transfer. Automatic legacy claim is therefore off.
 *
 * Follow-up before the branded pilot: a controlled restore where the user proves
 * the project (not a cookie). Unclaimed guest rows keep their original
 * `session_id` in the database until then, so nothing is lost — only unreachable
 * without that restore. Projects that already carry `user_id` need no claim and
 * stay visible after re-login.
 */
export async function setAuthCookie(token: string, options?: { secure?: boolean }): Promise<void> {
  const secure = resolveAuthCookieSecure(options);
  const cookieStore = await cookies();
  cookieStore.set(
    authCookieWriteName(secure),
    token,
    hostCookieSetOptions({ secure, maxAge: JWT_EXPIRY }),
  );
  if (!secure) return;

  const host = requestHostFromHeaders(await incomingHeaders());
  // Production must not keep the unprefixed name as a live permission cookie.
  cookieStore.set(
    AUTH_COOKIE_LEGACY_NAME,
    "",
    expireLeftoverCookieOptions(host),
  );
}

/**
 * Clear the `__Host-` cookie and the pre-migration name, on HTTPS including the
 * parent `Domain` a subdomain could have planted it on.
 */
export async function clearAuthCookie(options?: { secure?: boolean }): Promise<void> {
  const secure = resolveAuthCookieSecure(options);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_HOST_NAME, "", expireCookieSetOptions(true));
  if (!secure) {
    cookieStore.set(AUTH_COOKIE_LEGACY_NAME, "", expireCookieSetOptions(false));
    return;
  }
  const host = requestHostFromHeaders(await incomingHeaders());
  cookieStore.set(
    AUTH_COOKIE_LEGACY_NAME,
    "",
    expireLeftoverCookieOptions(host),
  );
}

/**
 * Get auth token from request headers (for API routes)
 */
export function getTokenFromRequest(request: Request): string | null {
  return getAuthTokenFromRequest(request);
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
 * Resolve the signed-in user inside a Server Component / Server Action, where
 * there is no `Request` object to read headers from.
 *
 * Same token contract as {@link getCurrentUser} — it just reads the auth cookie
 * via `next/headers` instead of a request header, so the cookie name stays
 * single-sourced in this module.
 */
export async function getCurrentUserFromCookies(): Promise<User | null> {
  const token = await readAuthTokenFromIncomingCookies();
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return getUserById(payload.userId);
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

  // Every database password login must prove ownership first. Privileged
  // accounts are provisioned through the env-credential branch above, so an
  // unverified database row on a privileged address is not trusted.
  if (!user.email_verified) {
    return {
      error:
        "Du måste bekräfta din e-post innan du kan logga in. Använd 'Skicka verifieringsmail igen' i inloggningsrutan.",
    };
  }

  if (isAdminEmail(user.email || normalizedEmail)) {
    await bootstrapAdminUser(user);
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
export function getGoogleAuthUrl(
  state?: string,
  redirectUri?: string,
  codeChallenge?: string,
): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: resolveGoogleRedirectUri(redirectUri),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGoogleCode(
  code: string,
  redirectUri?: string,
  codeVerifier?: string,
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
        redirect_uri: resolveGoogleRedirectUri(redirectUri),
        grant_type: "authorization_code",
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    if (!response.ok) {
      // B-GA: log only the status, never the raw body — an unexpected/proxy
      // response can carry sensitive fields ("Never log secret values!").
      console.error(
        `[Auth] Google token exchange failed: HTTP ${response.status} ${response.statusText}`,
      );
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
  redirectUri?: string,
  codeVerifier?: string,
): Promise<{ user: User; token: string; created: boolean } | { error: string }> {
  // Exchange code for tokens
  const tokens = await exchangeGoogleCode(code, redirectUri, codeVerifier);
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

  const { user, created } = await createGoogleUser(
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

  return { user: hydratedUser, token, created };
}

// ============ Type exports ============

export type { User };
