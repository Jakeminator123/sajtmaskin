import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * F2/preview stubs and copied `.env` files carry placeholder values; a
 * Supabase admin client constructed from those fails opaquely at write time.
 * Mirrors the shared stub vocabulary (`placeholder` / `not_real` / `dummy` /
 * `preview`).
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|preview|^your[_-]/i.test(trimmed);
}

/**
 * True only when BOTH service-role keys are real (non-empty, non-placeholder).
 * Placeholder-aware on every key — a real URL with a placeholder service-role
 * key still counts as NOT configured (the honest 503 setup path, never a real
 * call with fabricated config). Callers MUST check this before
 * getSupabaseAdmin().
 */
export function isSupabaseAdminConfigured(): boolean {
  return (
    !isPlaceholderValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !isPlaceholderValue(process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

let adminClient: SupabaseClient | null = null;

/**
 * Lazy, server-only Supabase admin (service-role) client. Paddle-namespaced
 * under `lib/paddle/` so it does not collide with the supabase-auth dossier's
 * `lib/supabase/*` when both are co-selected. NEVER constructed at module
 * import time: a module-level createClient() with empty env throws at
 * import/build and would make the route's env guard (503) unreachable. Callers
 * MUST check isSupabaseAdminConfigured() first; this throws a recognizable
 * error otherwise (defensive).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'subscriptions-not-configured: Supabase service-role env is missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
      );
    }
    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}
