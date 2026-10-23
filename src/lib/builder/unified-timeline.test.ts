import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { buildUnifiedTimeline } from "./unified-timeline";

function builder(id: string): ChatMessage {
  return { id, role: "user", content: id };
}

function agent(
  id: string,
  anchorBuilderMessageId: string | null | undefined,
  anchorBuilderMessageIndex?: number | null,
): OpenClawMessage {
  return {
    id,
    role: "assistant",
    content: id,
    timestamp: 0,
    anchorBuilderMessageId,
    anchorBuilderMessageIndex,
  };
}

function ids(entries: ReturnType<typeof buildUnifiedTimeline>): string[] {
  return entries.map((entry) => `${entry.kind}:${entry.message.id}`);
}

describe("buildUnifiedTimeline", () => {
  it("returnerar bara builderrader när agenten är tyst", () => {
    const entries = buildUnifiedTimeline([builder("u1"), builder("a1")], []);
    expect(ids(entries)).toEqual(["builder:u1", "builder:a1"]);
    expect(entries[1]).toMatchObject({ kind: "builder", index: 1 });
  });

  it("placerar agentrader direkt efter sitt ankare, i ursprunglig ordning", () => {
    const entries = buildUnifiedTimeline(
      [builder("u1"), builder("a1"), builder("u2")],
      [agent("q1", "a1"), agent("r1", "a1"), agent("q2", "u2")],
    );
    expect(ids(entries)).toEqual([
      "builder:u1",
      "builder:a1",
      "agent:q1",
      "agent:r1",
      "builder:u2",
      "agent:q2",
    ]);
  });

  it("faller tillbaka på positionen när byggradernas id har bytts ut", () => {
    // Historik hydrerad från servern: ankar-id:n (klientens optimistiska id)
    // finns inte längre, men antalet buildermeddelanden vid skapandet gör det.
    const entries = buildUnifiedTimeline(
      [builder("srv-1"), builder("srv-2"), builder("srv-3")],
      [agent("q1", "user-123", 2), agent("r1", "user-123", 2), agent("q2", "assistant-9", 3)],
    );
    expect(ids(entries)).toEqual([
      "builder:srv-1",
      "builder:srv-2",
      "agent:q1",
      "agent:r1",
      "builder:srv-3",
      "agent:q2",
    ]);
  });

  it("lägger rader från en tom chatt först och rader utan ankare sist", () => {
    const entries = buildUnifiedTimeline(
      [builder("u1")],
      [agent("no-anchor", undefined), agent("first", null), agent("pos0", "gone", 0)],
    );
    expect(ids(entries)).toEqual(["agent:first", "agent:pos0", "builder:u1", "agent:no-anchor"]);
  });

  it("lägger en position bortom listan sist", () => {
    const entries = buildUnifiedTimeline([builder("u1")], [agent("late", "gone", 5)]);
    expect(ids(entries)).toEqual(["builder:u1", "agent:late"]);
  });

  it("hanterar en tom builderchatt", () => {
    const entries = buildUnifiedTimeline([], [agent("q", null), agent("r", "x", 1)]);
    expect(ids(entries)).toEqual(["agent:q", "agent:r"]);
  });
});
