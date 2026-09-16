import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "kostnadsfri-unsub-v1:";

export type UnsubscribePayload = {
  email: string;
  slug: string;
};

function unsubscribeSecret(env: NodeJS.ProcessEnv = process.env): string {
  return (env.KOSTNADSFRI_PASSWORD_SEED || env.KOSTNADSFRI_API_KEY || "").trim();
}

export function normalizeUnsubscribeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function unsubscribedAtFromExtra(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const raw = (extra as { unsubscribedAt?: unknown }).unsubscribedAt;
  if (typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${TOKEN_PREFIX}${payload}`).digest("base64url");
}

export function createUnsubscribeToken(
  input: UnsubscribePayload,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const secret = unsubscribeSecret(env);
  const email = normalizeUnsubscribeEmail(input.email);
  const slug = input.slug.trim();
  if (!secret || !email || !slug) return null;
  const encoded = Buffer.from(JSON.stringify({ email, slug }), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): UnsubscribePayload | null {
  if (!token) return null;
  const secret = unsubscribeSecret(env);
  if (!secret) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  try {
    const expected = sign(encoded, secret);
    const actualBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<UnsubscribePayload>;
    const email = typeof payload.email === "string" ? normalizeUnsubscribeEmail(payload.email) : "";
    const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
    if (!email || !slug) return null;
    return { email, slug };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/kostnadsfri/unsubscribe?token=${encodeURIComponent(token)}`;
}
