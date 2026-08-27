import { afterEach, describe, expect, it } from "vitest";
import {
  clearPreviewSession,
  getActivePreviewSession,
  resetPreviewSessionStoreForTests,
  touchPreviewSession,
  touchPreviewSessionAsync,
} from "./session-store";

afterEach(() => {
  resetPreviewSessionStoreForTests();
});

describe("preview-session-store", () => {
  it("returns null when missing", () => {
    expect(getActivePreviewSession("c1", { now: 0 })).toBeNull();
  });

  it("touchPreviewSession records entry and preserves createdAt for same previewSessionId", () => {
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://x.vercel.run",
      now: 1_000,
    });
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://x.vercel.run",
      now: 2_000,
    });
    const e = getActivePreviewSession("c1", { now: 2_000 });
    expect(e?.createdAt).toBe(1_000);
    expect(e?.lastUsedAt).toBe(2_000);
  });

  it("expires after idle window", () => {
    const t0 = 1_000_000;
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://x.run",
      now: t0,
    });
    const idleMs = 30 * 60 * 1000;
    expect(getActivePreviewSession("c1", { now: t0 + idleMs - 1, idleMs })).not.toBeNull();
    expect(getActivePreviewSession("c1", { now: t0 + idleMs + 1, idleMs })).toBeNull();
  });

  it("stores versionId when provided", () => {
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://x.run",
      versionId: "ver-99",
      now: 0,
    });
    expect(getActivePreviewSession("c1", { now: 0 })?.versionId).toBe("ver-99");
  });

  it("stores tier2Provider preview_host when set", () => {
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://fly.example",
      versionId: "v1",
      tier2Provider: "preview_host",
      now: 0,
    });
    expect(getActivePreviewSession("c1", { now: 0 })?.tier2Provider).toBe("preview_host");
  });

  it("clearPreviewSession removes entry", () => {
    touchPreviewSession({
      chatId: "c1",
      previewSessionId: "ps1",
      previewUrl: "https://x.run",
      now: 0,
    });
    clearPreviewSession("c1");
    expect(getActivePreviewSession("c1", { now: 0 })).toBeNull();
  });

  it("reports a stale in-memory authoritative receipt as rejected", async () => {
    expect(await touchPreviewSessionAsync({
      chatId: "c-stale",
      previewSessionId: "ps-current",
      previewUrl: "https://x.run/current",
      versionId: "v2",
      lifecycleToken: "life-current",
      mutationRevision: 2,
      writeIntent: "authoritative",
      now: 2_000,
    })).toBe(true);

    expect(await touchPreviewSessionAsync({
      chatId: "c-stale",
      previewSessionId: "ps-old",
      previewUrl: "https://x.run/old",
      versionId: "v1",
      lifecycleToken: "life-old",
      mutationRevision: 1,
      writeIntent: "authoritative",
      now: 1_000,
    })).toBe(false);
    expect(getActivePreviewSession("c-stale", { now: 2_000 })).toMatchObject({
      versionId: "v2",
      lifecycleToken: "life-current",
      mutationRevision: 2,
    });
  });
});
