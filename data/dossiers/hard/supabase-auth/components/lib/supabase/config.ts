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
 * A real value is non-empty and not a preview/stub placeholder. F2 design
 * previews and copied `.env.local` files often carry `*placeholder*` values;
 * treating those as configured would hand `createServerClient` a bogus URL and
 * surface a raw crash instead of the calm not-configured path.
 */
function isRealValue(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !trimmed.toLowerCase().includes("placeholder");
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
