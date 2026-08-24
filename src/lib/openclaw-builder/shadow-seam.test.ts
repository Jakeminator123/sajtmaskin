import { describe, expect, it } from "vitest";

import { decideShadowSeam, type ShadowSeamInput } from "./shadow-seam";

const HASH = "a".repeat(64);

function input(overrides: Partial<ShadowSeamInput> = {}): ShadowSeamInput {
  return {
    requestedLane: "classic",
    packageFrozen: true,
    generationInputPackageHash: HASH,
    jobStatus: "running",
    shadowAvailable: false,
    ...overrides,
  };
}

describe("decideShadowSeam", () => {
  it("defaults classic to classic_only + default_classic", () => {
    expect(decideShadowSeam(input())).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
    expect(decideShadowSeam(input({ shadowAvailable: true }))).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
  });

  it("keeps classic when shadow is requested but unavailable", () => {
    expect(
      decideShadowSeam(
        input({ requestedLane: "openclaw_shadow", shadowAvailable: false }),
      ),
    ).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "lane_unavailable",
      generationInputPackageHash: HASH,
    });
  });

  it("arms shadow additively beside classic when available", () => {
    const decision = decideShadowSeam(
      input({ requestedLane: "openclaw_shadow", shadowAvailable: true }),
    );
    expect(decision).toEqual({
      ok: true,
      dispatch: "classic_plus_shadow",
      reason: "shadow_armed",
      generationInputPackageHash: HASH,
    });
    if (decision.ok) {
      expect(decision.dispatch).not.toBe("shadow_only");
      expect(decision.dispatch.startsWith("classic")).toBe(true);
    }
  });

  it("never arms a candidate lane, even when shadow is available", () => {
    expect(
      decideShadowSeam(
        input({ requestedLane: "openclaw_candidate", shadowAvailable: true }),
      ),
    ).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "lane_unavailable",
      generationInputPackageHash: HASH,
    });
    expect(
      decideShadowSeam(
        input({ requestedLane: "openclaw_candidate", shadowAvailable: false }),
      ),
    ).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "lane_unavailable",
      generationInputPackageHash: HASH,
    });
  });

  it("rejects an unfrozen package", () => {
    expect(decideShadowSeam(input({ packageFrozen: false }))).toEqual({
      ok: false,
      code: "package_not_frozen",
    });
    expect(
      decideShadowSeam(
        input({
          packageFrozen: false,
          requestedLane: "openclaw_shadow",
          shadowAvailable: true,
        }),
      ),
    ).toEqual({ ok: false, code: "package_not_frozen" });
  });

  it("rejects a hash that is not 64 lowercase hex", () => {
    expect(
      decideShadowSeam(input({ generationInputPackageHash: "A".repeat(64) })),
    ).toEqual({ ok: false, code: "invalid_hash" });
    expect(
      decideShadowSeam(input({ generationInputPackageHash: "not-a-hash" })),
    ).toEqual({ ok: false, code: "invalid_hash" });
    expect(
      decideShadowSeam(input({ generationInputPackageHash: HASH.slice(0, 63) })),
    ).toEqual({ ok: false, code: "invalid_hash" });
    expect(
      decideShadowSeam(input({ generationInputPackageHash: `${HASH}0` })),
    ).toEqual({ ok: false, code: "invalid_hash" });
  });

  it("rejects a job that is not running", () => {
    for (const jobStatus of [
      "pending",
      "completed",
      "failed",
      "stale",
      "cancelled",
      "superseded",
      "expired",
    ] as const) {
      expect(decideShadowSeam(input({ jobStatus }))).toEqual({
        ok: false,
        code: "job_not_running",
      });
    }
  });

  it("treats an empty or garbage lane as classic default", () => {
    expect(decideShadowSeam(input({ requestedLane: "" }))).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
    expect(decideShadowSeam(input({ requestedLane: "   " }))).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
    expect(decideShadowSeam(input({ requestedLane: "not-a-lane" }))).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
    expect(decideShadowSeam(input({ requestedLane: "OPENCLAW_SHADOW" }))).toEqual({
      ok: true,
      dispatch: "classic_only",
      reason: "default_classic",
      generationInputPackageHash: HASH,
    });
  });

  it("fails closed on malformed input", () => {
    expect(decideShadowSeam(null as unknown as ShadowSeamInput)).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(
      decideShadowSeam({
        ...input(),
        packageFrozen: "true",
      } as unknown as ShadowSeamInput),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect(
      decideShadowSeam({
        ...input(),
        jobStatus: "unknown",
      } as unknown as ShadowSeamInput),
    ).toEqual({ ok: false, code: "invalid_input" });
  });

  it("never returns a dispatch that skips classic", () => {
    const cases: ShadowSeamInput[] = [
      input(),
      input({ requestedLane: "openclaw_shadow", shadowAvailable: true }),
      input({ requestedLane: "openclaw_shadow", shadowAvailable: false }),
      input({ requestedLane: "openclaw_candidate", shadowAvailable: true }),
      input({ requestedLane: "" }),
    ];
    for (const seamInput of cases) {
      const decision = decideShadowSeam(seamInput);
      expect(decision.ok).toBe(true);
      if (decision.ok) {
        expect(["classic_only", "classic_plus_shadow"]).toContain(decision.dispatch);
      }
    }
  });
});
