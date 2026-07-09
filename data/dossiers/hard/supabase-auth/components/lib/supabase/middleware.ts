import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAuthConfig, isSupabaseAuthConfigured } from "@/lib/supabase/config";

/**
 * Refresh the Supabase auth session on every matched request, using the modern
 * @supabase/ssr `getAll` / `setAll` cookie contract.
 *
 * When the public Supabase env vars are missing or placeholders the middleware
 * degrades to a pass-through (`NextResponse.next()`) instead of constructing a
 * client with `undefined` keys — so an unconfigured preview never 500s the
 * whole site (mirrors the clerk-auth key-gate).
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseAuthConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session (required for Server Components). Do NOT run other
  // logic between createServerClient and getUser — it can desync the session.
  await supabase.auth.getUser();

  return response;
}
