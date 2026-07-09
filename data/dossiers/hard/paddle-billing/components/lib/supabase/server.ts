import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Demo/placeholder detection — mirrors the shared stub vocabulary used by the
 * other hard dossiers so F2-mock-seeded anon keys never reach createServerClient.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|preview|^your[_-]/i.test(trimmed);
}

/**
 * True when BOTH public Supabase env vars hold real (non-placeholder) values.
 * The customer-portal route must check this before createSupabaseServerClient()
 * — isSupabaseAdminConfigured() alone is insufficient (Codex P1: service-role
 * can be real while anon key is still a preview stub).
 */
export function isSupabaseServerConfigured(): boolean {
  return (
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/**
 * Server-side Supabase auth client (anon key) for reading the signed-in user in
 * route handlers / server components. Requires NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY — callers that must degrade gracefully when
 * Supabase is unconfigured should guard on isSupabaseServerConfigured() first.
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseServerConfigured()) {
    throw new Error(
      'subscriptions-not-configured: Supabase server auth env is missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // No-op in Server Components that cannot mutate cookies.
          }
        },
      },
    },
  );
}
