import { timingSafeEqual } from "node:crypto";
import { OPENCLAW } from "@/lib/config";

/**
 * Constant-time check of the OpenClaw debug OWNER token.
 *
 * Compares the request's `x-oc-debug-token` header against the server secret
 * `OC_DEBUG_RUN_TOKEN`. This is the shared owner gate for privileged debug
 * capabilities:
 *   - the Mode B bug-hunt run route (`/api/openclaw/debug/run`), and
 *   - the public chat route's read-only Sajtmaskin source branch
 *     (`[SAJTMASKIN-KÄLLKOD]` in `/api/openclaw/chat`).
 *
 * Privileged debug access requires the operator secret, never mere session
 * presence. Hard-disabled (returns `false`) unless the secret is configured, so
 * a misconfigured deploy fails closed rather than exposing platform internals.
 * The token is NEVER forwarded to downstream engine endpoints.
 */
export function matchesOpenClawDebugToken(req: Request): boolean {
  const expected = OPENCLAW.debugRunToken;
  if (!expected) return false; // hard-disabled unless the secret is set
  const provided = req.headers.get("x-oc-debug-token") ?? "";
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
