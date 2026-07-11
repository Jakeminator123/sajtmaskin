import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  featureState: { previewPrewarm: false as boolean },
  baseUrlRef: { value: "https://preview-host.example" as string | null },
  startSpy: vi.fn(),
  buildSpy: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  FEATURES: h.featureState,
  REDIS_KEY_PREFIX: "test:",
}));
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
      {
        path: ".env.local",
        content: "NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=baseline",
        language: "text",
      },
    ];
  },
}));

import {
  createPreviewPrewarmLeaseKey,
  prewarmPreviewSession,
  __resetPreviewPrewarmStateForTests,
} from "./preview-prewarm";

const OK = { ok: true, previewUrl: "https://p/x", previewSessionId: "ps_1", startOutcome: "recreated" as const };
const LEASE_KEY = "a".repeat(64);

describe("prewarmPreviewSession", () => {
  beforeEach(() => {
    __resetPreviewPrewarmStateForTests();
    h.featureState.previewPrewarm = true;
    h.baseUrlRef.value = "https://preview-host.example";
    h.startSpy.mockReset();
    h.buildSpy.mockReset();
    h.startSpy.mockResolvedValue(OK);
    vi.stubEnv("SAJTMASKIN_PREVIEW_HOST_API_KEY", "unit-test-preview-host-key");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("does nothing when the feature flag is off", async () => {
    h.featureState.previewPrewarm = false;
    const res = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(res).toEqual({ started: false, reason: "flag_off" });
    expect(h.startSpy).not.toHaveBeenCalled();
    expect(h.buildSpy).not.toHaveBeenCalled();
  });

  it("does nothing when tier-2 preview host is not configured", async () => {
    h.baseUrlRef.value = null;
    const res = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(res).toEqual({ started: false, reason: "tier2_not_configured" });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("returns no_chat when chatId is empty", async () => {
    const res = await prewarmPreviewSession("", { leaseKey: LEASE_KEY });
    expect(res).toEqual({ started: false, reason: "no_chat" });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("fires exactly one host boot with the baseline skeleton (package.json present)", async () => {
    const res = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(res).toEqual({ started: true });
    expect(h.startSpy).toHaveBeenCalledTimes(1);
    const arg = h.startSpy.mock.calls[0][0] as {
      chatId: string;
      versionId: string;
      filesJson: Record<string, string>;
      prewarm: boolean;
      prewarmLeaseKey: string;
    };
    expect(arg.chatId).toBe("chat1");
    expect(arg.versionId).toBe("chat1-prewarm");
    expect(arg.prewarm).toBe(true);
    expect(arg.prewarmLeaseKey).toBe(LEASE_KEY);
    expect(arg.filesJson["package.json"]).toBeTruthy();
    // Prewarm intentionally builds the complete baseline without a dossier
    // scope. Its dependency fingerprint ignores env files.
    expect(h.buildSpy).toHaveBeenCalledWith([]);
    expect(arg.filesJson[".env.local"]).toContain(
      "NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=baseline",
    );
    // SCAFFOLD_FILES ships no app/page.tsx; prewarm injects a placeholder so the boot goes green.
    expect(arg.filesJson["app/page.tsx"]).toBeTruthy();
  });

  it("dedupes: a second prewarm for the same chat does not fire again", async () => {
    await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    const second = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(second).toEqual({ started: false, reason: "already_prewarmed" });
    expect(h.startSpy).toHaveBeenCalledTimes(1);
  });

  it("clears dedup on host error so a later attempt can retry", async () => {
    h.startSpy.mockResolvedValueOnce({ ok: false, message: "boom", retryable: true });
    const first = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(first.started).toBe(false);
    expect(first.reason).toBe("host_error");

    h.startSpy.mockResolvedValueOnce(OK);
    const retry = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(retry).toEqual({ started: true });
    expect(h.startSpy).toHaveBeenCalledTimes(2);
  });

  it("never throws when the host client rejects", async () => {
    h.startSpy.mockRejectedValueOnce(new Error("network down"));
    const res = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(res.started).toBe(false);
    expect(res.reason).toBe("prewarm_threw");
  });

  it("keeps superseded terminal and process-deduped", async () => {
    h.startSpy.mockResolvedValueOnce({
      ok: false,
      message: "superseded",
      retryable: false,
      prewarmDisposition: "superseded",
    });
    const first = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    const second = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(first.reason).toBe("prewarm_superseded");
    expect(second.reason).toBe("already_prewarmed");
    expect(h.startSpy).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry rate limiting but permits a later explicit retry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T00:00:00Z"));
    h.startSpy
      .mockResolvedValueOnce({
        ok: false,
        message: "rate limited",
        retryable: false,
        prewarmDisposition: "rate_limited",
      })
      .mockResolvedValueOnce(OK);

    const first = await prewarmPreviewSession("chat1", { leaseKey: LEASE_KEY });
    expect(first.reason).toBe("prewarm_rate_limited");
    // One invocation performs exactly one host attempt: no automatic retry or
    // duplicate log loop inside the fire-and-forget call.
    expect(h.startSpy).toHaveBeenCalledTimes(1);

    const immediateDuplicate = await prewarmPreviewSession("chat1", {
      leaseKey: LEASE_KEY,
    });
    expect(immediateDuplicate.reason).toBe("prewarm_rate_limited");
    expect(h.startSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_001);
    const laterUserRetry = await prewarmPreviewSession("chat1", {
      leaseKey: LEASE_KEY,
    });
    expect(laterUserRetry).toEqual({ started: true });
    expect(h.startSpy).toHaveBeenCalledTimes(2);
  });

  it("requires an opaque host lease key before creating work", async () => {
    const res = await prewarmPreviewSession("chat1");
    expect(res).toEqual({ started: false, reason: "no_lease_key" });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("uses canonical guest identity so cookie rotation cannot mint a lease", () => {
    const first = new Request("https://example.com", {
      headers: {
        "x-real-ip": "203.0.113.8",
        cookie: "sajtmaskin_session=guest-session-1",
      },
    });
    const rotated = new Request("https://example.com", {
      headers: {
        "x-real-ip": "203.0.113.8",
        cookie: "sajtmaskin_session=guest-session-2",
      },
    });
    const guest = createPreviewPrewarmLeaseKey(first);
    expect(guest).toMatch(/^[a-f0-9]{64}$/);
    expect(guest).toBe(createPreviewPrewarmLeaseKey(rotated));
    expect(guest).not.toContain("203.0.113.8");
    expect(guest).not.toContain("guest-session");
  });

  it("requires a configured preview-host API key for lease derivation and attempt", async () => {
    delete process.env.SAJTMASKIN_PREVIEW_HOST_API_KEY;
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.8" },
    });
    const leaseKey = createPreviewPrewarmLeaseKey(request);
    expect(leaseKey).toBeNull();
    await expect(prewarmPreviewSession("chat-no-key", { leaseKey })).resolves.toEqual({
      started: false,
      reason: "no_lease_key",
    });
    expect(h.startSpy).not.toHaveBeenCalled();
  });

  it("keeps authenticated identities distinct from their request IP", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.8" },
    });
    expect(createPreviewPrewarmLeaseKey(request, { userId: "user-1" })).not.toBe(
      createPreviewPrewarmLeaseKey(request, { userId: "user-2" }),
    );
  });
});
