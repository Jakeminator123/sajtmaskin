/**
 * Sanitize the OAuth callback `next` parameter into a safe, same-origin
 * relative path.
 *
 * The callback route must NEVER redirect to an attacker-supplied absolute or
 * cross-origin URL — an open redirect turns the login flow into a phishing /
 * token-leak vector. Only a relative path that starts with a single "/" is
 * allowed. Everything else — absolute URLs, scheme prefixes, protocol-relative
 * "//host", backslash-smuggled targets, control characters, or malformed
 * values — falls back to the default ("/").
 *
 * Pure string/URL logic with no imports so it can be unit-tested standalone
 * (see src/lib/gen/dossiers/supabase-auth-guards.test.ts).
 */

const DEFAULT_REDIRECT = "/";

export function sanitizeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (typeof next !== "string") return fallback;

  const value = next.trim();

  // Must be a relative path beginning with a single "/".
  if (!value.startsWith("/")) return fallback;
  // Protocol-relative ("//host") and backslash-smuggled ("/\\host", "\\host")
  // targets can be read as absolute by browsers and URL parsers.
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // Control chars / whitespace inside the path enable "/%0A/evil" style breaks
  // and header-injection tricks.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;

  // Authoritative same-origin gate: resolve against an opaque base URL. Any
  // absolute or protocol-relative payload resolves to a different origin and is
  // rejected. On success we return the normalized path+query+hash, dropping any
  // smuggled origin the parser may have absorbed.
  try {
    const base = "http://localhost";
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
