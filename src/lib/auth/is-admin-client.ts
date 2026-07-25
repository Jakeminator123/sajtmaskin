/**
 * Client-side hint for whether an email belongs to an admin.
 *
 * PRESENTATION ONLY — it decides whether to render the "Adminpanel" shortcut, and
 * nothing else. Access is enforced server-side (`src/proxy.ts` for the pages,
 * `requireAdminAccess` for the API routes, `getAdminUserForPage` for the admin
 * layout). The old admin page used this kind of check as its actual gate, which
 * both forced a second login and protected nothing.
 *
 * Reads the public allowlist (`NEXT_PUBLIC_ADMIN_EMAILS`, with the legacy
 * singular `NEXT_PUBLIC_ADMIN_EMAIL` as fallback) — the server-side list
 * (`ADMIN_EMAILS`) is never exposed to the browser, so a real admin whose email
 * is only in the server list simply doesn't see the shortcut.
 */
export function isAdminEmailClient(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;

  const allowlist = (
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ||
    process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
    ""
  )
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(normalized);
}
