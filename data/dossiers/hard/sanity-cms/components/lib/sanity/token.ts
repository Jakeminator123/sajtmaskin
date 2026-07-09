import "server-only";

/**
 * Server-only Sanity read token — required for draft-mode preview and any
 * private dataset. `server-only` makes an accidental client-component import
 * a build error instead of a leaked secret.
 */
export const token = process.env.SANITY_API_READ_TOKEN;

/** True when a non-empty read token is configured. Gate the draft client / draft-mode routes on this in addition to `isSanityConfigured()`. */
export function isSanityDraftTokenConfigured(): boolean {
  return typeof token === "string" && token.trim().length > 0;
}
