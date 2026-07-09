import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Shared stub vocabulary — see lib/supabase/admin.ts. */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|preview|^your[_-]/i.test(trimmed);
}

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Runs through the Next.js middleware matcher, so it executes on ALL pages. If
 * Supabase is not configured yet (env missing OR an F2/preview placeholder
 * stub), we MUST NOT construct a client — createServerClient throws on an
 * invalid URL/key, which would 500 every single request behind the matcher
 * (whole-site outage in preview / before setup). Instead we degrade to a
 * pass-through (NextResponse.next), mirroring the key-gated clerk-auth
 * middleware pattern.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (isPlaceholderValue(supabaseUrl) || isPlaceholderValue(supabaseAnonKey)) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}
