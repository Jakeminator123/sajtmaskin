import { describe, expect, it } from "vitest";
import { evaluatePins } from "./check-sdk-versions.mjs";

const stripeFile = (apiVersion: string) => ({
  path: "data/dossiers/hard/stripe-checkout/components/api/checkout-session/route.ts",
  content: `import Stripe from "stripe";\nconst s = new Stripe("k", { apiVersion: "${apiVersion}" });\n`,
});

/** Build an SDK source map whose `expected()` returns a fixed result. */
function stripeSource(expected: { status: string; version?: string }) {
  return {
    stripe: {
      label: "stripe",
      importMatch: /from\s+["']stripe["']/,
      expected: () => expected,
    },
  };
}

describe("check-sdk-versions evaluatePins", () => {
  it("passes when the pinned apiVersion matches the installed SDK", () => {
    const res = evaluatePins({
      files: [stripeFile("2026-01-28.clover")],
      sdkSources: stripeSource({ status: "ok", version: "2026-01-28.clover" }),
    });
    expect(res.drifts).toEqual([]);
    expect(res.unreadable).toEqual([]);
    expect(res.checked).toHaveLength(1);
    expect(res.checked[0]).toMatchObject({ sdk: "stripe", pinned: "2026-01-28.clover" });
  });

  it("reports drift when the pin is stale", () => {
    const res = evaluatePins({
      files: [stripeFile("2024-10-28.acacia")],
      sdkSources: stripeSource({ status: "ok", version: "2026-01-28.clover" }),
    });
    expect(res.drifts).toHaveLength(1);
    expect(res.drifts[0]).toMatchObject({
      sdk: "stripe",
      pinned: "2024-10-28.acacia",
      expected: "2026-01-28.clover",
    });
  });

  it("FAILS CLOSED when the SDK is installed but the version is unreadable (not a silent skip)", () => {
    const res = evaluatePins({
      files: [stripeFile("2024-10-28.acacia")],
      sdkSources: stripeSource({ status: "unreadable" }),
    });
    // Must NOT be treated as a skip — that is the Codex P1 false-green.
    expect(res.skipped).toEqual([]);
    expect(res.checked).toEqual([]);
    expect(res.unreadable).toHaveLength(1);
    expect(res.unreadable[0]).toMatchObject({ sdk: "stripe" });
  });

  it("skips (exit 0) only when the SDK is genuinely not installed", () => {
    const res = evaluatePins({
      files: [stripeFile("2024-10-28.acacia")],
      sdkSources: stripeSource({ status: "not-installed" }),
    });
    expect(res.unreadable).toEqual([]);
    expect(res.drifts).toEqual([]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ reason: "stripe-not-installed" });
  });

  it("skips a pinned apiVersion that cannot be attributed to a known SDK", () => {
    const res = evaluatePins({
      files: [
        {
          path: "data/dossiers/soft/x/components/y.ts",
          content: `const cfg = { apiVersion: "2024-01-01" };\n`,
        },
      ],
      sdkSources: stripeSource({ status: "ok", version: "2026-01-28.clover" }),
    });
    expect(res.checked).toEqual([]);
    expect(res.drifts).toEqual([]);
    expect(res.skipped[0]).toMatchObject({ reason: "unrecognized-sdk" });
  });

  it("ignores files without a pinned apiVersion", () => {
    const res = evaluatePins({
      files: [{ path: "a.ts", content: `import Stripe from "stripe";\n` }],
      sdkSources: stripeSource({ status: "ok", version: "2026-01-28.clover" }),
    });
    expect(res.checked).toEqual([]);
    expect(res.drifts).toEqual([]);
    expect(res.skipped).toEqual([]);
  });
});
