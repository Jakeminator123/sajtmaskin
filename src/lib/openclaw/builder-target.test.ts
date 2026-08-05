import { afterEach, describe, expect, it } from "vitest";

import { readBuilderTurnSnapshot } from "./builder-target";

afterEach(() => {
  delete window.__SITEMASKIN_CONTEXT;
});

describe("readBuilderTurnSnapshot", () => {
  it("reads the builder turn fields the handshake polls", () => {
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      chatId: "chat-1",
      activeVersionId: "ver-2",
      isStreaming: false,
      activeVersionStatus: "ready",
      activeVersionIsLatest: true,
      chatMessageCount: 6,
      awaitingInput: false,
    };

    expect(readBuilderTurnSnapshot()).toEqual({
      chatId: "chat-1",
      activeVersionId: "ver-2",
      isStreaming: false,
      versionStatus: "ready",
      versionIsLatest: true,
      chatMessageCount: 6,
      awaitingInput: false,
    });
  });

  it("is null off the builder, so autonomy can never resume on another page", () => {
    window.__SITEMASKIN_CONTEXT = { page: "landing", chatId: "chat-1" };
    expect(readBuilderTurnSnapshot()).toBeNull();
  });

  it("is null without a context at all", () => {
    expect(readBuilderTurnSnapshot()).toBeNull();
  });

  it("treats a missing latest-version flag as a stale view rather than a fresh one", () => {
    // An absent flag must not read as "you are looking at the newest version" —
    // the handshake would then trust a terminal status describing an older row.
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      chatId: "chat-1",
      activeVersionStatus: "ready",
    };

    const snapshot = readBuilderTurnSnapshot();
    expect(snapshot?.versionIsLatest).toBe(false);
    expect(snapshot?.activeVersionId).toBeNull();
  });
});
