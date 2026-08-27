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
  const onRecoverFailed = vi.fn();
  const bootstrapDone = { current: new Set<string>() } as MutableRefObject<Set<string>>;
  const rendered = renderHook(
    (props: { activeVersionFailedWithoutPreviewUrl?: boolean }) =>
      usePreviewSession({
        chatId: "chat_1",
        activeVersionId: "ver_2",
        activeVersionFailedWithoutPreviewUrl: props.activeVersionFailedWithoutPreviewUrl,
        currentPreviewUrl: TIER2_URL,
        activePreviewSessionMeta: { previewSessionId: "sbx_1", versionId: "ver_2" },
        setCurrentPreviewUrl: vi.fn(),
        setPreviewSessionRecovering: setRecovering,
        previewBootstrapDoneKeysRef: bootstrapDone,
        setForcedPreviewRestartKey: setForceKey,
        setPreviewBootstrapRetryNonce: setRetryNonce,
        onRecoverFailed,
        now: overrides?.now,
      }),
    {
      initialProps: {
        activeVersionFailedWithoutPreviewUrl:
          overrides?.activeVersionFailedWithoutPreviewUrl,
      },
    },
  );
  return { rendered, setRecovering, setForceKey, setRetryNonce, onRecoverFailed, bootstrapDone };
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
    expect(h.rendered.result.current.versionMismatchPayload?.reason).toBe(
      "auto_resync_exhausted",
    );
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
    // Suppressions-payloaden ska INTE se ut som en förbrukad auto-resync —
    // UI:t renderar banner (ingen force-restart) utifrån detta fält.
    expect(h.rendered.result.current.versionMismatchPayload?.reason).toBe(
      "suppressed_failed_version",
    );
  });

  it("återupptar normal auto-resync när failed-versionen senare fått previewUrl/reparerats (flaggan släpper)", async () => {
    let clock = 1_700_000;
    vi.mocked(fetchPreviewStatus).mockResolvedValue(
      mismatch("sbx_restored", "ver_3", "session_newer"),
    );

    const h = harness({
      now: () => clock,
      activeVersionFailedWithoutPreviewUrl: true,
    });

    // Suppression aktiv: ingen restart, banner-payload.
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });
    expect(h.setForceKey).not.toHaveBeenCalled();
    expect(h.rendered.result.current.versionMismatchPayload?.reason).toBe(
      "suppressed_failed_version",
    );

    // Versionen repareras / får previewUrl → flaggan blir false vid nästa render.
    h.rendered.rerender({ activeVersionFailedWithoutPreviewUrl: false });

    clock += 12_001;
    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });

    // Normal mismatch-väg återupptagen: auto-resync körs (suppressionen har
    // inte förbrukat loop-skyddets attempt-nyckel).
    expect(h.setForceKey).toHaveBeenCalledWith("chat_1:ver_2");
    expect(h.setRetryNonce).toHaveBeenCalledTimes(1);
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
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

  it("behandlar build_error som terminalt: ingen forcerad omstart, ytar readinessError, stoppar loopen", async () => {
    vi.mocked(fetchPreviewStatus).mockResolvedValue({
      ok: true,
      status: "build_error",
      previewSessionId: "sbx_1",
      previewUrl: TIER2_URL,
      versionId: "ver_2",
      sessionExpiresAt: null,
      reason: "build_error_overlay",
      readinessError: "Module not found: Can't resolve 'radix-ui'",
    });

    const h = harness();

    await act(async () => {
      await h.rendered.result.current.handlePreviewSessionSuspect();
    });

    // Deterministiskt byggfel → INGEN forcerad omstart (skulle bara köra om
    // samma trasiga bygge och dölja readinessError).
    expect(h.setForceKey).not.toHaveBeenCalled();
    expect(h.setRetryNonce).not.toHaveBeenCalled();
    // Loopen stoppas och felet ytas med readinessError-detaljen.
    expect(h.setRecovering).toHaveBeenLastCalledWith(false);
    expect(h.onRecoverFailed).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "ver_2",
      reason: "build_error",
      detail: "Module not found: Can't resolve 'radix-ui'",
    });
    expect(h.rendered.result.current.versionMismatchPayload).toBeNull();
  });

  it("build_error triggar aldrig forcerad omstart ens vid upprepade poll", async () => {
    vi.mocked(fetchPreviewStatus).mockResolvedValue({
      ok: true,
      status: "build_error",
      previewSessionId: "sbx_1",
      previewUrl: TIER2_URL,
      versionId: "ver_2",
      sessionExpiresAt: null,
      reason: "build_error_overlay",
      readinessError: null,
    });

    let clock = 9_000_000;
    const h = harness({ now: () => clock });

    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        await h.rendered.result.current.handlePreviewSessionSuspect();
      });
      clock += 12_001;
    }

    expect(h.setForceKey).not.toHaveBeenCalled();
    expect(h.setRetryNonce).not.toHaveBeenCalled();
    // Ingen detaljerad readinessError → detail null, fortfarande reason build_error.
    expect(h.onRecoverFailed).toHaveBeenLastCalledWith({
      chatId: "chat_1",
      versionId: "ver_2",
      reason: "build_error",
      detail: null,
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

  it("ignorerar ett sent status-svar från den gamla preview-identiteten", async () => {
    let resolveStatus!: (value: PreviewStatusApiJson) => void;
    vi.mocked(fetchPreviewStatus).mockReturnValue(
      new Promise<PreviewStatusApiJson>((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const setCurrentPreviewUrl = vi.fn();
    const setRecovering = vi.fn();
    const setForceKey = vi.fn();
    const setRetryNonce = vi.fn();
    const bootstrapDone = { current: new Set<string>() } as MutableRefObject<Set<string>>;
    const oldUrl = "https://chat-1.fly.dev/preview/old";
    const newUrl = "https://chat-1.fly.dev/preview/new";
    const rendered = renderHook(
      (props: {
        versionId: string;
        previewSessionId: string;
        lifecycleToken: string;
        previewUrl: string;
      }) =>
        usePreviewSession({
          chatId: "chat_1",
          activeVersionId: props.versionId,
          currentPreviewUrl: props.previewUrl,
          activePreviewSessionMeta: {
            previewSessionId: props.previewSessionId,
            versionId: props.versionId,
            lifecycleToken: props.lifecycleToken,
          },
          setCurrentPreviewUrl,
          setPreviewSessionRecovering: setRecovering,
          previewBootstrapDoneKeysRef: bootstrapDone,
          setForcedPreviewRestartKey: setForceKey,
          setPreviewBootstrapRetryNonce: setRetryNonce,
        }),
      {
        initialProps: {
          versionId: "c3ff",
          previewSessionId: "ps_old",
          lifecycleToken: "life_old",
          previewUrl: oldUrl,
        },
      },
    );

    let pending!: Promise<void>;
    act(() => {
      pending = rendered.result.current.handlePreviewSessionSuspect();
    });
    rendered.rerender({
      versionId: "cac4",
      previewSessionId: "ps_new",
      lifecycleToken: "life_new",
      previewUrl: newUrl,
    });
    resolveStatus(mismatch("ps_old", "older-host-version", "session_older"));
    await act(async () => {
      await pending;
    });

    expect(setCurrentPreviewUrl).not.toHaveBeenCalled();
    expect(setForceKey).not.toHaveBeenCalled();
    expect(setRetryNonce).not.toHaveBeenCalled();
    expect(setRecovering).not.toHaveBeenCalled();
    expect(rendered.result.current.versionMismatchPayload).toBeNull();
  });
});
