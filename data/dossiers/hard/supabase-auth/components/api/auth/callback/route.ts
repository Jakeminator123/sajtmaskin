import { NextResponse } from "next/server";

import { isSupabaseAuthConfigured } from "@/lib/supabase/config";
import { sanitizeNextPath } from "@/lib/supabase/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link code-exchange callback.
 *
 * Security: the post-login destination comes from the untrusted `next` query
 * parameter, so it is sanitized to a same-origin relative path before use
 * (`sanitizeNextPath`) — never trust it directly (open-redirect risk). When
 * Supabase is not configured we skip the exchange and just redirect to the
 * sanitized destination instead of throwing.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code && isSupabaseAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Do not send an unauthenticated visitor to the intended destination.
      return NextResponse.redirect(new URL("/", origin));
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
