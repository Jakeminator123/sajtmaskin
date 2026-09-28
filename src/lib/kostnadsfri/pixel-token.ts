import {
  KOSTNADSFRI_OPEN_PURPOSE,
  createKostnadsfriSignedToken,
  verifyKostnadsfriSignedToken,
  type KostnadsfriTokenEnvLookup,
  type KostnadsfriTokenPayload,
} from "./signed-token";

export type PixelTokenPayload = KostnadsfriTokenPayload;
export type PixelTokenEnvLookup = KostnadsfriTokenEnvLookup;

export function createPixelToken(
  input: PixelTokenPayload,
  env: PixelTokenEnvLookup = process.env,
): string | null {
  return createKostnadsfriSignedToken(KOSTNADSFRI_OPEN_PURPOSE, input, env);
}

export function verifyPixelToken(
  token: string | null | undefined,
  env: PixelTokenEnvLookup = process.env,
): PixelTokenPayload | null {
  return verifyKostnadsfriSignedToken(KOSTNADSFRI_OPEN_PURPOSE, token, env);
}

export const PIXEL_DEBOUNCE_MS = 30 * 60 * 1000;

export function shouldCountPixelHit(lastHitAt: Date | string | null | undefined, now = new Date()): boolean {
  if (!lastHitAt) return true;
  const last = lastHitAt instanceof Date ? lastHitAt : new Date(lastHitAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= PIXEL_DEBOUNCE_MS;
}
