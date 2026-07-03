import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import { usePreviewSession } from "./usePreviewSession";

vi.mock("@/lib/builder/preview-session/api", () => ({
  fetchPreviewStatus: vi.fn(),
}));

vi.mock("@/lib/gen/preview/lifecycle-telemetry", () => ({
  logPreviewLifecycleTelemetry: vi.fn(),
}));

import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";
import type { PreviewStatusApiJson } from "@/lib/gen/preview/preview-contract";

const TIER2_URL = "https://chat-1.fly.dev/preview";

function harness(overrides?: {
  now?: () => number;
  activeVersionFailedWithoutPreviewUrl?: boolean;
}) {
  const setRecovering = vi.fn();
  const setForceKey = vi.fn();
  const setRetryNonce = vi.fn();
  const bootstrapDone = { current: new Set<string>() } as MutableRefObject<Set<string>>;
  const rendered = renderHook(() =>
    usePreviewSession({
      chatId: "chat_1",
      activeVersionId: "ver_2",
      activeVersionFailedWithoutPreviewUrl:
        overrides?.activeVersionFailedWithoutPreviewUrl,
      currentPreviewUrl: TIER2_URL,
      activePreviewSessionMeta: { previewSessionId: "sbx_1", versionId: "ver_2" },
      setCurrentPreviewUrl: vi.fn(),
      bumpPreviewRefreshToken: vi.fn(),
      setPreviewSessionRecovering: setRecovering,
      previewBootstrapDoneKeysRef: bootstrapDone,
      setForcedPreviewRestartKey: setForceKey,
      setPreviewBootstrapRetryNonce: setRetryNonce,
      now: overrides?.now,
    }),
  );
  return { rendered, setRecovering, setForceKey, setRetryNonce, bootstrapDone };
}

const mismatch = (
  previewSessionId: string,
  versionId: string,
  direction: "session_newer" | "session_older" | "unknown",
): PreviewStatusApiJson =>
  ({
    ok: true,
    status: "version_mismatch",
    previewSessionId,
    previewUrl: TIER2_URL,
    versionId,
    sessionExpiresAt: null,
    reason: "session_bound_to_other_version",
    mismatchDirection: direction,
  }) satisfies PreviewStatusApiJson;

describe("usePreviewSession — version_mismatch auto-resync + loop-skydd", () => {
  beforeEach(() => {
    vi.mocked(fetchPreviewStatus).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-resyncar EN gång vid första mismatch (ingen overlay), sedan overlay vid fortsatt mismatch", async () => {
    let clock = 1_000_000;
    vi.mocked(fetchPreviewStatus).mockResolvedValue(mismatch("sbx_1", "ver_1", "session_older"));

    const h = harness({ now: () => clock });

    // Första observationen → auto-resync (forced restart), ingen overlay.
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_2");
    expect(h.setRecovering).toHaveBeenCalledWith(true);
    expect(h.setRetryNonce).toHaveBeenCalledTimes(1);
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();

    // Andra observationen (samma stale-session sbx_1) efter 12s-debounce →
    // loop-skydd: ingen ny restart, overlay visas i stället.
    clock += 12_001;
    h.setForceKey.mockClear();
    h.setRetryNonce.mockClear();
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.rendered.result.current.versionMismatchPayload).not.toBeNull();
    expect(h.rendered.result.current.versionMismatchPayload?.mismatchDirection).toBe("session_older");
    expect(h.setForceKey).not.toHaveBeenCalled();
    expect(h.setRetryNonce).not.toHaveBeenCalled();
  });

  it("undertrycker auto-resync när aktiv version är failed utan previewUrl och mismatchen pekar mot nyare session", async () => {
    const clock = 1_500_000;
    vi.mocked(fetchPreviewStatus).mockResolvedValue(
      mismatch("sbx_restored", "ver_3", "session_newer"),
    );

    const h = harness({
      now: () => clock,
      activeVersionFailedWithoutPreviewUrl: true,
    });

    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });

    expect(h.setForceKey).not.toHaveBeenCalled();
    expect(h.setRetryNonce).not.toHaveBeenCalled();
    expect(h.rendered.result.current.versionMismatchPayload).not.toBeNull();
    expect(h.rendered.result.current.versionMismatchPayload?.mismatchDirection).toBe(
      "session_newer",
    );
  });

  it("behåller auto-resync för äkta mismatch även när failed-utan-url-skyddet är på", async () => {
    vi.mocked(fetchPreviewStatus).mockResolvedValue(
      mismatch("sbx_old", "ver_1", "session_older"),
    );

    const h = harness({
      activeVersionFailedWithoutPreviewUrl: true,
    });

    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });

    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_2");
    expect(h.setRetryNonce).toHaveBeenCalledTimes(1);
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
  });

  it("tillåter en ny auto-resync när preview-sessionen (session id) är en annan efter första omstarten", async () => {
    let clock = 2_000_000;
    vi.mocked(fetchPreviewStatus)
      .mockResolvedValueOnce(mismatch("sbx_1", "ver_1", "session_older"))
      .mockResolvedValueOnce(mismatch("sbx_2", "ver_1", "session_older"));

    const h = harness({ now: () => clock });

    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.setForceKey).toHaveBeenCalledTimes(1);

    // Ny stale-session (sbx_2) → per-session-nyckeln tillåter ett nytt försök.
    clock += 12_001;
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.setForceKey).toHaveBeenCalledTimes(2);
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
  });

  it("forcePreviewResync tvingar alltid en omstart och rensar overlay (bypassar loop-skyddet)", async () => {
    let clock = 3_000_000;
    vi.mocked(fetchPreviewStatus).mockResolvedValue(mismatch("sbx_1", "ver_1", "session_older"));

    const h = harness({ now: () => clock });

    // Bygg upp overlay: auto-resync + andra mismatch.
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    clock += 12_001;
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.rendered.result.current.versionMismatchPayload).not.toBeNull();

    // Manuell resync tvingar omstart trots att auto-försöket redan förbrukats.
    h.setForceKey.mockClear();
    h.setRetryNonce.mockClear();
    act(() => {
      h.rendered.result.current.forcePreviewResync();
    });
    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_2");
    expect(h.setRetryNonce).toHaveBeenCalledTimes(1);
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();

    // Efter manuell resync är loop-skyddet nollställt för versionen → nästa
    // mismatch (samma sessions-id) tillåts auto-resynca igen.
    clock += 12_001;
    h.setForceKey.mockClear();
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_2");
  });

  it("forcePreviewResync med explicit versionId (restore-vägen) tvingar omstart mot den versionen", () => {
    const h = harness();
    act(() => {
      h.rendered.result.current.forcePreviewResync("ver_restored");
    });
    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_restored");
    expect(h.setRecovering).toHaveBeenCalledWith(true);
    expect(h.setRetryNonce).toHaveBeenCalledTimes(1);
  });

  it("rensar overlay-payload när status blir running mot förväntad version", async () => {
    let clock = 5_000_000;
    vi.mocked(fetchPreviewStatus)
      .mockResolvedValueOnce(mismatch("sbx_1", "ver_1", "session_older"))
      .mockResolvedValueOnce(mismatch("sbx_1", "ver_1", "session_older"))
      .mockResolvedValueOnce({
        ok: true,
        status: "running",
        previewSessionId: "sbx_1",
        previewUrl: TIER2_URL,
        versionId: "ver_2",
        sessionExpiresAt: null,
      });

    const h = harness({ now: () => clock });

    // 1: auto-resync, 2: overlay
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    clock += 12_001;
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.rendered.result.current.versionMismatchPayload).not.toBeNull();

    // 3: running mot ver_2 → overlay rensas.
    clock += 12_001;
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    await waitFor(() => {
      expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
    });
  });

  it("visar ingen payload och auto-resyncar inte när status är running direkt", async () => {
    vi.mocked(fetchPreviewStatus).mockResolvedValue({
      ok: true,
      status: "running",
      previewSessionId: "sbx_1",
      previewUrl: TIER2_URL,
      versionId: "ver_2",
      sessionExpiresAt: null,
    });

    const h = harness();

    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });

    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
    expect(h.setForceKey).not.toHaveBeenCalled();
  });
});
