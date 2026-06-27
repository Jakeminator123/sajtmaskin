/**
 * Route `maxDuration` ↔ manifest parity (Plan B #9).
 *
 * `config/ai_models/manifest.json` `routeTimeouts` is the source of truth for
 * the per-route server stream ceilings. Next.js requires `maxDuration` to be a
 * statically-analyzable literal in each route segment, so the backoffice writes
 * those literals via `sync_route_timeout_literals` (backoffice/shared.py). That
 * regex write can silently miss a file if its format ever changes — this test
 * is the CI gate that makes such drift impossible: every synced route's literal
 * must equal the manifest value.
 *
 * Keep this map in sync with `route_targets` in `sync_route_timeout_literals`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const manifest = JSON.parse(
  readFileSync(join(REPO_ROOT, "config/ai_models/manifest.json"), "utf8"),
) as {
  routeTimeouts: {
    engineRouteMaxDurationSeconds: { default: number };
    assistRouteMaxDurationSeconds: { default: number };
  };
};

const engineSeconds = manifest.routeTimeouts.engineRouteMaxDurationSeconds.default;
const assistSeconds = manifest.routeTimeouts.assistRouteMaxDurationSeconds.default;

// Mirrors `route_targets` in backoffice/shared.py `sync_route_timeout_literals`.
const ROUTE_TARGETS: Array<{ rel: string; expected: number }> = [
  { rel: "src/app/api/engine/chats/stream/route.ts", expected: engineSeconds },
  { rel: "src/app/api/engine/chats/[chatId]/stream/route.ts", expected: engineSeconds },
  { rel: "src/app/api/ai/chat/route.ts", expected: assistSeconds },
  { rel: "src/app/api/ai/brief/route.ts", expected: assistSeconds },
];

function readMaxDuration(rel: string): number | null {
  const src = readFileSync(join(REPO_ROOT, rel), "utf8");
  const match = src.match(/export const maxDuration = (\d+);/);
  return match ? Number(match[1]) : null;
}

describe("route maxDuration ↔ manifest routeTimeouts parity", () => {
  it.each(ROUTE_TARGETS)(
    "$rel exports maxDuration === manifest value ($expected)",
    ({ rel, expected }) => {
      const actual = readMaxDuration(rel);
      expect(
        actual,
        `${rel} has no \`export const maxDuration = N;\` literal — the backoffice ` +
          `route-timeout sync would silently skip it. Restore the literal or update ` +
          `the sync target map.`,
      ).not.toBeNull();
      expect(actual, `${rel} maxDuration drifted from manifest routeTimeouts`).toBe(expected);
    },
  );
});
