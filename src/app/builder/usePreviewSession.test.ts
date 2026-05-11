import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { usePreviewSession } from "./usePreviewSession";

vi.mock("@/lib/builder/preview-session/api", () => ({
  fetchPreviewStatus: vi.fn(),
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";

const TIER2_URL = "https://vm-fly-jakem.fly.dev/preview";

function harness(overrides?: { now?: () => number }) {
  return renderHook(() => {
    const [, setRecovering] = useState(false);
    const [, setForceKey] = useState<string | null>(null);
    const [, setRetryNonce] = useState(0);
    const bootstrapDone = useRef<Set<string>>(new Set());
    const session = usePreviewSession({
      chatId: "chat_1",
      activeVersionId: "ver_2",
      currentPreviewUrl: TIER2_URL,
      activePreviewSessionMeta: { previewSessionId: "sbx_1", versionId: "ver_2" },
      setCurrentPreviewUrl: vi.fn(),
      bumpPreviewRefreshToken: vi.fn(),
      setPreviewSessionRecovering: setRecovering,
      previewBootstrapDoneKeysRef: bootstrapDone,
      setForcedPreviewRestartKey: setForceKey,
      setPreviewBootstrapRetryNonce: setRetryNonce,
      now: overrides?.now,
    });
    return { session };
  });
}

describe("usePreviewSession — version mismatch detection", () => {
  beforeEach(() => {
    vi.mocked(fetchPreviewStatus).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits VersionMismatchOverlayPayload when status is version_mismatch", async () => {
    let clock = 1_000_000;
    vi.mocked(fetchPreviewStatus).mockResolvedValue({
      ok: true,
      status: "version_mismatch",
      previewSessionId: "sbx_1",
      previewUrl: TIER2_URL,
      versionId: "ver_1",
      sessionExpiresAt: null,
      reason: "session_bound_to_other_version",
    });

    const { result } = harness({ now: () => clock });

    expect(result.current.session.versionMismatchPayload).toBeNull();

    await act(async () => {
      await result.current.session.handlePreviewSessionSuspect();
    });

    const payload = result.current.session.versionMismatchPayload;
    expect(payload).not.toBeNull();
    expect(payload?.chatId).toBe("chat_1");
    expect(payload?.expectedVersionId).toBe("ver_2");
    expect(payload?.currentVersionId).toBe("ver_1");
    expect(payload?.msSinceMismatch).toBe(0);

    // Andra observation efter 12s+4s: anchor pinnas vid första observationen,
    // msSinceMismatch växer. Bypass-debounce kräver minst 12_000ms.
    clock += 16_001;

    await act(async () => {
      await result.current.session.handlePreviewSessionSuspect();
    });

    const payload2 = result.current.session.versionMismatchPayload;
    expect(payload2?.msSinceMismatch).toBeGreaterThanOrEqual(16_001);
  });

  it("clears payload when status returns to running with the expected versionId", async () => {
    vi.mocked(fetchPreviewStatus)
      .mockResolvedValueOnce({
        ok: true,
        status: "version_mismatch",
        previewSessionId: "sbx_1",
        previewUrl: TIER2_URL,
        versionId: "ver_1",
        sessionExpiresAt: null,
        reason: "session_bound_to_other_version",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: "running",
        previewSessionId: "sbx_1",
        previewUrl: TIER2_URL,
        versionId: "ver_2",
        sessionExpiresAt: null,
      });

    let clock = 5_000_000;
    const { result } = harness({ now: () => clock });

    await act(async () => {
      await result.current.session.handlePreviewSessionSuspect();
    });
    expect(result.current.session.versionMismatchPayload).not.toBeNull();

    clock += 12_001;

    await act(async () => {
      await result.current.session.handlePreviewSessionSuspect();
    });

    await waitFor(() => {
      expect(result.current.session.versionMismatchPayload).toBeNull();
    });
  });

  it("does NOT emit payload when status is running on first observation", async () => {
    vi.mocked(fetchPreviewStatus).mockResolvedValue({
      ok: true,
      status: "running",
      previewSessionId: "sbx_1",
      previewUrl: TIER2_URL,
      versionId: "ver_2",
      sessionExpiresAt: null,
    });

    const { result } = harness();

    await act(async () => {
      await result.current.session.handlePreviewSessionSuspect();
    });

    expect(result.current.session.versionMismatchPayload).toBeNull();
  });
});
