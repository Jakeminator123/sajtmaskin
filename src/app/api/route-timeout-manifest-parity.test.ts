/**
 * Route `maxDuration` ↔ manifest parity (Plan B #9).
 *
 * `config/ai_models/manifest.json` `routeTimeouts` is the source of truth for
 * the per-route server stream ceilings. Next.js requires `maxDuration` to be a
 * statically-analyzable literal in each route segment, so the literals are
 * generated deterministically by `scripts/ai-models/sync-route-timeouts.mjs`
 * (canonical owner — the backoffice no longer patches route files). This test
 * is the CI gate that makes drift impossible: every target route's literal must
 * equal the manifest value.
 *
 * The route→manifest-field map is NOT duplicated here — it is imported from the
 * single source `scripts/ai-models/route-timeout-targets.mjs`, shared with the
 * codegen, so the test and the generator can never drift apart.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ROUTE_TIMEOUT_TARGETS } from "../../../scripts/ai-models/route-timeout-targets.mjs";

const REPO_ROOT = join(__dirname, "..", "..", "..");

const manifest = JSON.parse(
  readFileSync(join(REPO_ROOT, "config/ai_models/manifest.json"), "utf8"),
) as {
  routeTimeouts: Record<string, { default: number }>;
};

const ROUTE_TARGETS: Array<{ rel: string; expected: number }> = ROUTE_TIMEOUT_TARGETS.map(
  ({ rel, manifestField }) => ({
    rel,
    expected: manifest.routeTimeouts[manifestField].default,
  }),
);

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
