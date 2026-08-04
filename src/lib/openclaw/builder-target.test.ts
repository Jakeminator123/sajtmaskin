import { afterEach, describe, expect, it } from "vitest";

import { publishBuilderSendTurn, readBuilderTurnSnapshot } from "./builder-target";

afterEach(() => {
  delete window.__SITEMASKIN_CONTEXT;
});

describe("publishBuilderSendTurn", () => {
  it("is visible to the next poll without waiting for a render", () => {
    // The handshake polls the context object directly, so a refusal that only
    // lands on the next React commit would be read a beat late — long enough
    // for the loop to act on a turn it already knows was refused.
    window.__SITEMASKIN_CONTEXT = { page: "builder", chatId: "chat-1" };

    publishBuilderSendTurn({ rejectedSendSeq: 5 });

    expect(readBuilderTurnSnapshot()?.rejectedSendSeq).toBe(5);
  });

  it("leaves the rest of the builder context alone", () => {
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      chatId: "chat-1",
      activeVersionId: "ver-2",
    };

    publishBuilderSendTurn({ rejectedSendSeq: 5 });

    const snapshot = readBuilderTurnSnapshot();
    expect(snapshot?.activeVersionId).toBe("ver-2");
    expect(snapshot?.chatId).toBe("chat-1");
  });

  it("is a no-op outside the builder", () => {
    // Nothing to correlate against off the builder page, and inventing a
    // context object there would make `readBuilderTurnSnapshot` answer for a
    // page that has no send loop at all.
    expect(() => publishBuilderSendTurn({ rejectedSendSeq: 2 })).not.toThrow();
    expect(window.__SITEMASKIN_CONTEXT).toBeUndefined();
  });
});
