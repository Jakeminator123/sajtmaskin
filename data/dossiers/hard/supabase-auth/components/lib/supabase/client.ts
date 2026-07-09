"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseAuthConfig } from "@/lib/supabase/config";

/**
 * Browser Supabase client for client components (sign-in, sign-up, OAuth start,
 * sign-out). Lazy: the config guard runs on every call and throws a clear
 * `supabase-auth-not-configured` error instead of passing `undefined` into
 * createBrowserClient. Gate UI with `isSupabaseAuthConfigured()` to degrade to
 * an "Auth ej konfigurerat" notice instead of throwing.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseAuthConfig();
  return createBrowserClient(url, anonKey);
}
