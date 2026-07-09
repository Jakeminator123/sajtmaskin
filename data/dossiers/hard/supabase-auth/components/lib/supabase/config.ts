/**
 * Lazy Supabase Auth configuration guard.
 *
 * Reads the two public Supabase env vars at CALL time (never at module scope,
 * never as a constructed client) and rejects empty / preview-placeholder
 * values. Every Supabase client factory in this dossier calls
 * `getSupabaseAuthConfig()` so a missing key produces a clear, typed auth error
 * instead of passing `undefined` into createServerClient / createBrowserClient.
 *
 * UI and route code should call `isSupabaseAuthConfigured()` first to degrade
 * gracefully — render an "Auth ej konfigurerat" notice / skip the auth call —
 * instead of letting the SDK throw. This keeps an unconfigured preview from
 * crashing (the middleware also degrades to a pass-through, see middleware.ts).
 */

/** Error code thrown by the client factories when Supabase env is missing. */
export const SUPABASE_AUTH_NOT_CONFIGURED = "supabase-auth-not-configured";

/**
 * Demo/placeholder detection (mock: none). A key counts as NOT configured when
 * missing OR a preview stub — F2 previews seed
 * `..._placeholder_preview_not_real` values, and copied `.env.local` files
 * often carry `dummy` / `changeme` / `your_...` stand-ins. Mirrors the shared
 * stub vocabulary used by the other hard dossiers (Codex/VADE P1 on #468) so
 * a seeded stub is never handed to createServerClient/createBrowserClient as
 * a real Supabase URL/key.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|^your[_-]/i.test(trimmed);
}

/** A real value is non-empty and not a preview/stub placeholder. */
function isRealValue(value: string | undefined): value is string {
  return !isPlaceholderValue(value);
}

/** True only when both public Supabase env vars hold real (non-placeholder) values. */
export function isSupabaseAuthConfigured(): boolean {
  return (
    isRealValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isRealValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

/**
 * Returns the validated Supabase config, or throws `SUPABASE_AUTH_NOT_CONFIGURED`
 * when either public env var is missing or a placeholder. Callers that want to
 * degrade gracefully MUST check `isSupabaseAuthConfigured()` first.
 */
export function getSupabaseAuthConfig(): SupabaseAuthConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!isRealValue(url) || !isRealValue(anonKey)) {
    throw new Error(SUPABASE_AUTH_NOT_CONFIGURED);
  }
  return { url, anonKey };
}
