import { debugLog } from "@/lib/utils/debug";

const routeHitCounts = new Map<string, number>();

/** Count + dev log for remaining `/api/v0/chats/*` traffic (compat layer). */
export function logLegacyV0ChatsHit(routeLabel: string): void {
  const next = (routeHitCounts.get(routeLabel) ?? 0) + 1;
  routeHitCounts.set(routeLabel, next);
  debugLog("v0-compat", "legacy /api/v0/chats hit", { route: routeLabel, count: next });
}
