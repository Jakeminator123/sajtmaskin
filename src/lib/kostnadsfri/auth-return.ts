import { sanitizeOAuthReturnTo } from "@/lib/auth/oauth-state";
import { kostnadsfriSlugFromPathname } from "./agent-campaign-script";

const SLUG = /^[a-z0-9-]{1,120}$/;

export function kostnadsfriAuthReturnPath(slug: string): string {
  return `/kostnadsfri/${slug}`;
}

/**
 * Only first-party `/kostnadsfri/[slug]` paths may come back from Google or
 * the verification email. Anything else falls back to null so the caller
 * keeps today's homepage redirect.
 */
export function sanitizeKostnadsfriAuthReturnTo(
  rawReturnTo: string | null | undefined,
  origin: string,
): string | null {
  const path = sanitizeOAuthReturnTo(rawReturnTo, origin, "/");
  const pathname = path.split("?")[0]?.split("#")[0] ?? "";
  const slug = kostnadsfriSlugFromPathname(pathname);
  if (!slug || !SLUG.test(slug)) return null;
  return kostnadsfriAuthReturnPath(slug);
}
