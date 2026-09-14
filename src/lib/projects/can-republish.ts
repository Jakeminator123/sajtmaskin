import type { SitePublishState } from "./project-client";

/**
 * Whether the portal may start another charged production deploy.
 *
 * A second POST while a build is pending/building (or while we are still
 * watching one) would debit the customer twice for the same live version.
 */
export function isInFlightPublishState(
  state: SitePublishState | string | null | undefined,
): boolean {
  return state === "pending" || state === "building";
}

export function isTerminalDeploymentStatus(
  status: string | null | undefined,
): boolean {
  return status === "ready" || status === "error" || status === "cancelled";
}

export function canRepublish(
  state: SitePublishState | null | undefined,
  flags: { republishing?: boolean; watching?: boolean } = {},
): boolean {
  if (!state) return false;
  if (flags.republishing || flags.watching) return false;
  if (isInFlightPublishState(state)) return false;
  return true;
}
