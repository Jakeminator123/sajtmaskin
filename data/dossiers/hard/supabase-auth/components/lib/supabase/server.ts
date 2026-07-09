import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAuthConfig } from "@/lib/supabase/config";

/**
 * Server Supabase client for Server Components, Route Handlers and Server
 * Actions. Uses the modern @supabase/ssr `getAll` / `setAll` cookie contract.
 *
 * The `setAll` writes are wrapped in try/catch: a Server Component has a
 * read-only cookie store, and the middleware (`updateSupabaseSession`) is
 * responsible for refreshing the session there — so a failed write from a
 * Server Component is safe to ignore.
 *
 * Lazy: the config guard runs on every call (never a module-level client), so
 * missing env throws a clear `supabase-auth-not-configured` error instead of
 * passing `undefined` into createServerClient.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseAuthConfig();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component with a read-only cookie store.
          // Middleware refreshes the session, so this write can be ignored.
        }
      },
    },
  });
}
