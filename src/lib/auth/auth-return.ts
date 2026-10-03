import { sanitizeOAuthReturnTo } from "@/lib/auth/oauth-state";
import { sanitizeKostnadsfriAuthReturnTo } from "@/lib/kostnadsfri/auth-return";

const ANALYS_RESUME_VALUES = new Set(["pdf", "build"]);

/**
 * Canonical return target shared by the email-verification routes.
 *
 * Keep the existing invitation contract and add only the two explicit
 * analysis resume targets. Query strings are otherwise rejected so a caller
 * cannot smuggle state into a trusted redirect.
 */
export function sanitizeAuthReturnTo(
  rawReturnTo: string | null | undefined,
  origin: string,
): string | null {
  if (!rawReturnTo) return null;

  const kostnadsfriReturnTo = sanitizeKostnadsfriAuthReturnTo(
    rawReturnTo,
    origin,
  );
  if (kostnadsfriReturnTo) return kostnadsfriReturnTo;

  const path = sanitizeOAuthReturnTo(rawReturnTo, origin, "/");
  if (path === "/") return null;

  let candidate: URL;
  try {
    candidate = new URL(path, origin);
  } catch {
    return null;
  }

  if (candidate.hash) return null;

  if (candidate.pathname !== "/analys") return null;

  const params = [...candidate.searchParams.entries()];
  if (params.length !== 1) return null;
  const [key, value] = params[0];
  if (key !== "resume" || !ANALYS_RESUME_VALUES.has(value)) return null;

  return `/analys?resume=${value}`;
}
