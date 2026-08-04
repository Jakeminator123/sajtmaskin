import { afterEach, describe, expect, it } from "vitest";

import { publishBuilderSendTurn, readBuilderTurnSnapshot } from "./builder-target";

afterEach(() => {
  delete window.__SITEMASKIN_CONTEXT;
});

describe("publishBuilderSendTurn", () => {
  it("is visible to a reader in the same tick as the send that bumped it", () => {
    // The armed auto-send reads the id and clicks without yielding, so a value
    // that only lands on the next React commit would name the previous turn —
    // and a send starting microseconds earlier could then steal the id the
    // watch believes it owns.
    window.__SITEMASKIN_CONTEXT = { page: "builder", chatId: "chat-1", nextSendSeq: 5 };

    publishBuilderSendTurn({ nextSendSeq: 6 });

    expect(readBuilderTurnSnapshot()?.nextSendSeq).toBe(6);
  });

  it("leaves the rest of the builder context alone", () => {
    window.__SITEMASKIN_CONTEXT = {
      page: "builder",
      chatId: "chat-1",
      activeVersionId: "ver-2",
      nextSendSeq: 5,
    };

    publishBuilderSendTurn({ rejectedSendSeq: 5 });

    const snapshot = readBuilderTurnSnapshot();
    expect(snapshot?.rejectedSendSeq).toBe(5);
    expect(snapshot?.nextSendSeq).toBe(5);
    expect(snapshot?.activeVersionId).toBe("ver-2");
  });

  it("is a no-op outside the builder", () => {
    // Nothing to correlate against off the builder page, and inventing a
    // context object there would make `readBuilderTurnSnapshot` answer for a
    // page that has no send loop at all.
    expect(() => publishBuilderSendTurn({ nextSendSeq: 2 })).not.toThrow();
    expect(window.__SITEMASKIN_CONTEXT).toBeUndefined();
  });
});
