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
