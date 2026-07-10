import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  featureState: { previewPrewarm: false as boolean },
  baseUrlRef: { value: "https://preview-host.example" as string | null },
  startSpy: vi.fn(),
  buildSpy: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ FEATURES: h.featureState }));
vi.mock("@/lib/gen/preview/tier2-config", () => ({
  getPreviewHostBaseUrl: () => h.baseUrlRef.value,
}));
vi.mock("@/lib/gen/preview/preview-host-client", () => ({
  startPreviewHostSession: (params: unknown) => h.startSpy(params),
}));
vi.mock("@/lib/gen/export/project-scaffold", () => ({
  buildCompleteProject: (...args: unknown[]) => {
    h.buildSpy(...args);
    return [
      { path: "package.json", content: '{"name":"x"}', language: "json" },
      { path: "app/layout.tsx", content: "export default function L(){return null}", language: "typescript" },
    ];
  },
}));

import {
  prewarmPreviewSession,
  __resetPreviewPrewarmStateForTests,
} from "./preview-prewarm";

const OK = { ok: true, previewUrl: "https://p/x", previewSessionId: "ps_1", startOutcome: "recreated" as const };

describe("prewarmPreviewSession", () => {
  beforeEach(() => {
    __resetPreviewPrewarmStateForTests();
    h.featureState.previewPrewarm = true;
    h.baseUrlRef.value = "https://preview-host.example";
    h.startSpy.mockReset();
    h.buildSpy.mockReset();
    h.startSpy.mockResolvedValue(OK);
  });

  it("does nothing when the feature flag is off", async () => {
    h.featureState.previewPrewarm = false;
    const res = await prewarmPreviewSession("chat1");
    expect(res).toEqual({ started: false, reason: "flag_off" });
    expect(h.startSpy).not.toHaveBeenCalled();
    expect(h.buildSpy).not.toHaveBeenCalled();
  });

  it("does nothing when tier-2 preview host is not configured", async () => {
    h.baseUrlRef.value = null;
    const res = await prewarmPreviewSession("chat1");
    expect(res).toEqual({ started: false, reason: "tier2_not_configured" });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("returns no_chat when chatId is empty", async () => {
    const res = await prewarmPreviewSession("");
    expect(res).toEqual({ started: false, reason: "no_chat" });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("fires exactly one host boot with the baseline skeleton (package.json present)", async () => {
    const res = await prewarmPreviewSession("chat1");
    expect(res).toEqual({ started: true });
    expect(h.startSpy).toHaveBeenCalledTimes(1);
    const arg = h.startSpy.mock.calls[0][0] as {
      chatId: string;
      versionId: string;
      filesJson: Record<string, string>;
    };
    expect(arg.chatId).toBe("chat1");
    expect(arg.versionId).toBe("chat1-prewarm");
    expect(arg.filesJson["package.json"]).toBeTruthy();
    // SCAFFOLD_FILES ships no app/page.tsx; prewarm injects a placeholder so the boot goes green.
    expect(arg.filesJson["app/page.tsx"]).toBeTruthy();
  });

  it("dedupes: a second prewarm for the same chat does not fire again", async () => {
    await prewarmPreviewSession("chat1");
    const second = await prewarmPreviewSession("chat1");
    expect(second).toEqual({ started: false, reason: "already_prewarmed" });
    expect(h.startSpy).toHaveBeenCalledTimes(1);
  });

  it("clears dedup on host error so a later attempt can retry", async () => {
    h.startSpy.mockResolvedValueOnce({ ok: false, message: "boom", retryable: true });
    const first = await prewarmPreviewSession("chat1");
    expect(first.started).toBe(false);
    expect(first.reason).toBe("host_error");

    h.startSpy.mockResolvedValueOnce(OK);
    const retry = await prewarmPreviewSession("chat1");
    expect(retry).toEqual({ started: true });
    expect(h.startSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws when the host client rejects", async () => {
    h.startSpy.mockRejectedValueOnce(new Error("network down"));
    const res = await prewarmPreviewSession("chat1");
    expect(res.started).toBe(false);
    expect(res.reason).toBe("prewarm_threw");
  });
});
