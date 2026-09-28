import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shared HMAC tokens for kostnadsfri mail links.
 *
 * Purposes must never be interchangeable:
 *   kostnadsfri-unsub-v1 — POST /api/kostnadsfri/unsubscribe
 *   kostnadsfri-open-v1  — GET  /api/kostnadsfri/pixel.gif
 *
 * Payload JSON is compact (no spaces), key order email then slug:
 * {"email":"<lower>","slug":"<slug>"}
 */

export const KOSTNADSFRI_UNSUB_PURPOSE = "kostnadsfri-unsub-v1";
export const KOSTNADSFRI_OPEN_PURPOSE = "kostnadsfri-open-v1";

export type KostnadsfriTokenPayload = {
  email: string;
  slug: string;
};

/** HMAC-seed-lookup. Inte ProcessEnv — tester skickar bara seed, utan NODE_ENV. */
export type KostnadsfriTokenEnvLookup = Record<string, string | undefined>;

export function kostnadsfriTokenSecret(env: KostnadsfriTokenEnvLookup = process.env): string {
  return (env.KOSTNADSFRI_PASSWORD_SEED || env.KOSTNADSFRI_API_KEY || "").trim();
}

export function normalizeKostnadsfriTokenEmail(email: string): string {
  return email.trim().toLowerCase();
}

function compactPayloadJson(email: string, slug: string): string {
  return JSON.stringify({ email, slug });
}

function sign(purpose: string, encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(`${purpose}:${encoded}`).digest("base64url");
}

export function createKostnadsfriSignedToken(
  purpose: string,
  input: KostnadsfriTokenPayload,
  env: KostnadsfriTokenEnvLookup = process.env,
): string | null {
  const secret = kostnadsfriTokenSecret(env);
  const email = normalizeKostnadsfriTokenEmail(input.email);
  const slug = input.slug.trim();
  if (!secret || !email || !slug || !purpose) return null;
  const encoded = Buffer.from(compactPayloadJson(email, slug), "utf8").toString("base64url");
  return `${encoded}.${sign(purpose, encoded, secret)}`;
}

export function verifyKostnadsfriSignedToken(
  purpose: string,
  token: string | null | undefined,
  env: KostnadsfriTokenEnvLookup = process.env,
): KostnadsfriTokenPayload | null {
  if (!token || !purpose) return null;
  const secret = kostnadsfriTokenSecret(env);
  if (!secret) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const expected = sign(purpose, encoded, secret);
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<KostnadsfriTokenPayload>;
    const email = typeof payload.email === "string" ? normalizeKostnadsfriTokenEmail(payload.email) : "";
    const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
    if (!email || !slug) return null;
    return { email, slug };
  } catch {
    return null;
  }
}
