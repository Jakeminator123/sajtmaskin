import {
  KOSTNADSFRI_UNSUB_PURPOSE,
  createKostnadsfriSignedToken,
  normalizeKostnadsfriTokenEmail,
  verifyKostnadsfriSignedToken,
  type KostnadsfriTokenEnvLookup,
  type KostnadsfriTokenPayload,
} from "./signed-token";

export type UnsubscribePayload = KostnadsfriTokenPayload;
export type UnsubscribeEnvLookup = KostnadsfriTokenEnvLookup;

export const normalizeUnsubscribeEmail = normalizeKostnadsfriTokenEmail;

export function unsubscribedAtFromExtra(extra: unknown): string | null {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const raw = (extra as { unsubscribedAt?: unknown }).unsubscribedAt;
  if (typeof raw !== "string") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createUnsubscribeToken(
  input: UnsubscribePayload,
  env: UnsubscribeEnvLookup = process.env,
): string | null {
  return createKostnadsfriSignedToken(KOSTNADSFRI_UNSUB_PURPOSE, input, env);
}

export function verifyUnsubscribeToken(
  token: string | null | undefined,
  env: UnsubscribeEnvLookup = process.env,
): UnsubscribePayload | null {
  return verifyKostnadsfriSignedToken(KOSTNADSFRI_UNSUB_PURPOSE, token, env);
}

export function unsubscribeUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/kostnadsfri/unsubscribe?token=${encodeURIComponent(token)}`;
}
