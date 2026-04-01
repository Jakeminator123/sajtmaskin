import { afterEach, describe, expect, it } from "vitest";
import {
  bumpSandboxSessionActivity,
  clearSandboxSession,
  getActiveSandboxSession,
  resetSandboxSessionStoreForTests,
  touchSandboxSession,
} from "./session-store";

afterEach(() => {
  resetSandboxSessionStoreForTests();
});

describe("sandbox-session-store", () => {
  it("returns null when missing", () => {
    expect(getActiveSandboxSession("c1", { now: 0 })).toBeNull();
  });

  it("touchSandboxSession records entry and preserves createdAt for same sandboxId", () => {
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://x.vercel.run",
      now: 1_000,
    });
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://x.vercel.run",
      now: 2_000,
    });
    const e = getActiveSandboxSession("c1", { now: 2_000 });
    expect(e?.createdAt).toBe(1_000);
    expect(e?.lastUsedAt).toBe(2_000);
  });

  it("expires after idle window", () => {
    const t0 = 1_000_000;
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://x.run",
      now: t0,
    });
    const idleMs = 30 * 60 * 1000;
    expect(getActiveSandboxSession("c1", { now: t0 + idleMs - 1, idleMs })).not.toBeNull();
    expect(getActiveSandboxSession("c1", { now: t0 + idleMs + 1, idleMs })).toBeNull();
  });

  it("stores versionId when provided", () => {
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://x.run",
      versionId: "ver-99",
      now: 0,
    });
    expect(getActiveSandboxSession("c1", { now: 0 })?.versionId).toBe("ver-99");
  });

  it("stores tier2Provider preview_host when set", () => {
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://fly.example",
      versionId: "v1",
      tier2Provider: "preview_host",
      now: 0,
    });
    expect(getActiveSandboxSession("c1", { now: 0 })?.tier2Provider).toBe("preview_host");
  });

  it("clearSandboxSession removes entry", () => {
    touchSandboxSession({
      chatId: "c1",
      sandboxId: "s1",
      sandboxUrl: "https://x.run",
      now: 0,
    });
    clearSandboxSession("c1");
    expect(getActiveSandboxSession("c1", { now: 0 })).toBeNull();
  });
});
