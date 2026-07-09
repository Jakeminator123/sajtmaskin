import "server-only";

import { isPlaceholderValue } from "./api";

/**
 * Server-only Sanity read token — required for draft-mode preview and any
 * private dataset. `server-only` makes an accidental client-component import
 * a build error instead of a leaked secret.
 */
export const token = process.env.SANITY_API_TOKEN;

/**
 * True when a REAL (non-empty, non-placeholder) read token is configured.
 * Gate the draft client / draft-mode routes on this in addition to
 * `isSanityConfigured()` — the F2 preview stub must take the 503 setup path,
 * never a real API call with a fabricated token.
 */
export function isSanityDraftTokenConfigured(): boolean {
  return !isPlaceholderValue(token);
}
