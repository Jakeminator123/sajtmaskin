/**
 * Entry Token Utilities
 * ═══════════════════════════════════════════════════════════════
 *
 * Manages the sajtstudio demo token that arrives via ?token=xxx.
 * Stored in sessionStorage so it persists across page navigations
 * within the same tab but not across sessions.
 *
 * Token format: demo-<alphanumeric> (e.g. demo-kzmpc9tk45vsovp4cme1)
 * Source: sajtstudio.se SQLite (previews.db) slug system
 *
 * Future use cases:
 * - Pre-fill wizard with customer data fetched via token
 * - Link sajtmaskin sessions to sajtstudio analytics
 * - Priority/fast-track onboarding for demo visitors
 */

const STORAGE_KEY = "sajtmaskin_entry_token";

export type EntryToken = string;

/** Save token to sessionStorage */
export function saveEntryToken(token: EntryToken): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // sessionStorage unavailable (SSR, private browsing, etc.)
  }
}
