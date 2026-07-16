import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildWarmPassTelemetry } from "./warm-pass-telemetry";

const TSC_FLAG = "SAJTMASKIN_PRE_VM_TYPECHECK";
const ESLINT_FLAG = "SAJTMASKIN_BLOCKING_ESLINT";

describe("buildWarmPassTelemetry", () => {
  let savedTscFlag: string | undefined;
  let savedEslintFlag: string | undefined;

  beforeEach(() => {
    savedTscFlag = process.env[TSC_FLAG];
    savedEslintFlag = process.env[ESLINT_FLAG];
    delete process.env[TSC_FLAG];
    delete process.env[ESLINT_FLAG];
  });

  afterEach(() => {
    if (savedTscFlag === undefined) delete process.env[TSC_FLAG];
    else process.env[TSC_FLAG] = savedTscFlag;
    if (savedEslintFlag === undefined) delete process.env[ESLINT_FLAG];
    else process.env[ESLINT_FLAG] = savedEslintFlag;
  });

  it("rapporterar ran=true med skipped=null när båda passen körde", () => {
    process.env[TSC_FLAG] = "true";
    process.env[ESLINT_FLAG] = "true";
    const { warmTsc, warmEslint } = buildWarmPassTelemetry({
      tsc: { ran: true, durationMs: 2300, diagnosticCount: 0 },
      eslint: { ran: true, durationMs: 1900, errorCount: 0, warningCount: 2 },
      scaffoldId: "landing-page",
      isFidelity3: false,
    });
    expect(warmTsc).toEqual({
      enabled: true,
      ran: true,
      skipped: null,
      scaffoldId: "landing-page",
      durationMs: 2300,
    });
    expect(warmEslint).toEqual({
      enabled: true,
      ran: true,
      skipped: null,
      scaffoldId: "landing-page",
      durationMs: 1900,
      errorCount: 0,
      warningCount: 2,
    });
  });

  it("exponerar falsk-trygghet-fallet: flagga PÅ men cache_cold", () => {
    process.env[TSC_FLAG] = "true";
    const { warmTsc } = buildWarmPassTelemetry({
      tsc: { ran: false, skipped: "cache_cold", durationMs: 3 },
      eslint: undefined,
      scaffoldId: "portfolio",
      isFidelity3: false,
    });
    expect(warmTsc.enabled).toBe(true);
    expect(warmTsc.ran).toBe(false);
    expect(warmTsc.skipped).toBe("cache_cold");
    expect(warmTsc.scaffoldId).toBe("portfolio");
  });

  it("skiljer medvetet-av (enabled=false, feature_flag_disabled) från cache_cold", () => {
    const { warmTsc, warmEslint } = buildWarmPassTelemetry({
      tsc: { ran: false, skipped: "feature_flag_disabled", durationMs: 0 },
      eslint: { ran: false, skipped: "feature_flag_disabled", durationMs: 0 },
      scaffoldId: "blog",
      isFidelity3: false,
    });
    expect(warmTsc.enabled).toBe(false);
    expect(warmTsc.skipped).toBe("feature_flag_disabled");
    expect(warmEslint.enabled).toBe(false);
    expect(warmEslint.skipped).toBe("feature_flag_disabled");
    expect(warmEslint.errorCount).toBeNull();
    expect(warmEslint.warningCount).toBeNull();
  });

  it("F3 forces warm-tsc but never makes warm-eslint authoritative", () => {
    const { warmTsc, warmEslint } = buildWarmPassTelemetry({
      tsc: { ran: true, durationMs: 100, diagnosticCount: 1 },
      scaffoldId: "dashboard",
      isFidelity3: true,
    });
    expect(warmTsc.enabled).toBe(true);
    expect(warmEslint.enabled).toBe(false);
    expect(warmEslint.skipped).toBe("not_reached");
  });

  it("frånvarande utfall (esbuild nådde aldrig passed) blir not_reached", () => {
    const { warmTsc, warmEslint } = buildWarmPassTelemetry({
      tsc: undefined,
      eslint: undefined,
      scaffoldId: null,
      isFidelity3: false,
    });
    expect(warmTsc.ran).toBe(false);
    expect(warmTsc.skipped).toBe("not_reached");
    expect(warmTsc.scaffoldId).toBeNull();
    expect(warmEslint.skipped).toBe("not_reached");
  });
});
