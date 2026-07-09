import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * True only when a real-looking Supabase service-role configuration is present.
 * Placeholder / preview stubs (copied `.env` values, F2 preview injection)
 * count as unconfigured so the webhook route degrades to a calm 503 instead of
 * constructing an admin client that fails opaquely at write time. Callers MUST
 * check this before getSupabaseAdmin().
 */
export function isSupabaseAdminConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return false;
  return !/placeholder|preview/i.test(url) && !/placeholder|preview/i.test(key);
}

let adminClient: SupabaseClient | null = null;

/**
 * Lazy, server-only Supabase admin (service-role) client. NEVER constructed at
 * module import time: a module-level createClient() with empty env throws at
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
