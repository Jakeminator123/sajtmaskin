import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `runQualityGateChecks` must translate a `verify.ok === false` result from the
 * preview-host client (unreachable host / network / timeout / HTTP error) into a
 * typed, retryable `QualityGateUnavailableError` — NOT a generic `Error`. The
 * route relies on the type to avoid a false-RED `failed` verdict + hard 500 when
 * the gate never actually evaluated the code (a real check failure returns
 * `ok:true` with `passed:false` rows instead and never reaches this branch).
 */

const runPreviewHostQualityGate = vi.hoisted(() => vi.fn());
const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  runPreviewHostQualityGate,
}));

vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl,
}));

import {
  QualityGateUnavailableError,
  runQualityGateChecks,
} from "./preview-quality-gate";

describe("runQualityGateChecks — unreachable verify lane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
  });

  const baseParams = {
    chatId: "chat-1",
    versionId: "ver-1",
    files: [{ name: "app/page.tsx", content: "export default function Page(){}" }],
    checks: ["typecheck"] as const,
  };

  it("throws a retryable QualityGateUnavailableError on a network failure", async () => {
    runPreviewHostQualityGate.mockResolvedValue({
      ok: false,
      message: "fetch failed",
      retryable: true,
    });

    await expect(runQualityGateChecks({ ...baseParams })).rejects.toMatchObject({
      name: "QualityGateUnavailableError",
      retryable: true,
      message: "fetch failed",
    });
    await expect(runQualityGateChecks({ ...baseParams })).rejects.toBeInstanceOf(
      QualityGateUnavailableError,
    );
  });

  it("preserves a non-retryable flag for HTTP 4xx config failures", async () => {
    runPreviewHostQualityGate.mockResolvedValue({
      ok: false,
      message: "/preview/verify returned 404",
      retryable: false,
    });

    await expect(runQualityGateChecks({ ...baseParams })).rejects.toMatchObject({
      name: "QualityGateUnavailableError",
      retryable: false,
    });
  });
});

/**
 * Completeness (M#gs8): the RenderGate (F2) / ReleaseGate (F3) verdict is only
 * honest if every REQUESTED check actually reported back. An `ok:true` response
 * that dropped `build` or `typecheck` while every returned row is `passed`
 * would otherwise read as a green gate — a false-green. Such a response is
 * treated as `unavailable` (the existing fail-closed path), never as a pass.
 */
describe("runQualityGateChecks — incomplete verify response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPreviewHostBaseUrl.mockReturnValue("https://preview-host.example");
  });

  const baseParams = {
    chatId: "chat-1",
    versionId: "ver-1",
    files: [{ name: "app/page.tsx", content: "export default function Page(){}" }],
  };

  function passedResult(check: string) {
    return { check, passed: true, exitCode: 0, output: "" };
  }

  function okResponse(results: Array<Record<string, unknown>>) {
    return {
      ok: true,
      results,
      durationMs: 1_000,
      firstFailureCheck: null,
      jobStartedAt: "2026-08-01T00:00:00.000Z",
      jobFinishedAt: "2026-08-01T00:00:10.000Z",
    };
  }

  it("throws QualityGateUnavailableError when a requested check is missing from an all-passed response", async () => {
    runPreviewHostQualityGate.mockResolvedValue(
      okResponse([passedResult("install"), passedResult("typecheck")]),
    );

    await expect(
      runQualityGateChecks({ ...baseParams, checks: ["typecheck", "build"] as const }),
    ).rejects.toMatchObject({
      name: "QualityGateUnavailableError",
      retryable: false,
    });
    await expect(
      runQualityGateChecks({ ...baseParams, checks: ["typecheck", "build"] as const }),
    ).rejects.toBeInstanceOf(QualityGateUnavailableError);
    await expect(
      runQualityGateChecks({ ...baseParams, checks: ["typecheck", "build"] as const }),
    ).rejects.toThrow(/build/);
  });

  it("throws QualityGateUnavailableError when the response has no results at all", async () => {
    runPreviewHostQualityGate.mockResolvedValue(okResponse([]));

    await expect(
      runQualityGateChecks({ ...baseParams, checks: ["typecheck"] as const }),
    ).rejects.toBeInstanceOf(QualityGateUnavailableError);
  });

  it("returns a complete response unchanged", async () => {
    const response = okResponse([
      passedResult("install"),
      passedResult("typecheck"),
      passedResult("build"),
    ]);
    runPreviewHostQualityGate.mockResolvedValue(response);

    const gate = await runQualityGateChecks({
      ...baseParams,
      checks: ["typecheck", "build"] as const,
    });

    expect(gate.results).toEqual(response.results);
    expect(gate.verifyLaneDurationMs).toBe(1_000);
    expect(gate.firstFailureCheck).toBeNull();
  });

  it("keeps an early-return install failure as a real failure, not unavailable", async () => {
    // The verify lane stops before the canonical checks when `install` fails.
    // That response is legitimately incomplete but already red (and often
    // repairable), so it must keep its failure verdict.
    runPreviewHostQualityGate.mockResolvedValue({
      ...okResponse([
        passedResult("install-cache-share"),
        { check: "install", passed: false, exitCode: 1, output: "npm error ERESOLVE" },
      ]),
      firstFailureCheck: "install",
    });

    const gate = await runQualityGateChecks({
      ...baseParams,
      checks: ["typecheck", "build"] as const,
    });

    expect(gate.firstFailureCheck).toBe("install");
    expect(gate.results.some((result) => !result.passed)).toBe(true);
  });
});
