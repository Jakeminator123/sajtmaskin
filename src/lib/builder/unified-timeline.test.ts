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

  it("placerar äldre byggkommentarer enligt faktiska byggtider och bevarar angivna ankare", () => {
    const at = (second: number) => new Date(second * 1000).toISOString();
    const rows = [
      { ...builder("b1"), createdAt: at(10) },
      { ...builder("b2"), createdAt: at(20) },
      { ...builder("b3"), createdAt: at(40) },
    ];
    const entries = buildUnifiedTimeline(rows, [
      { ...agent("before", undefined), timestamp: 5_000 },
      { ...agent("digest", undefined), timestamp: 25_000 },
      { ...agent("anchored", "b1", 2), timestamp: 50_000 },
      { ...agent("index", "old-id", 2), timestamp: 51_000 },
    ]);
    expect(ids(entries)).toEqual([
      "agent:before", "builder:b1", "agent:anchored", "builder:b2", "agent:digest", "agent:index", "builder:b3",
    ]);
  });

  it("använder äldre lokala builder-id:n när klockslagen saknas i cachen", () => {
    const rows = [builder("assistant-1795778220000"), builder("user-1795778230000")];
    const digest = { ...agent("digest", undefined), timestamp: 1795778225423 };
    expect(ids(buildUnifiedTimeline(rows, [digest]))).toEqual([
      "builder:assistant-1795778220000", "agent:digest", "builder:user-1795778230000",
    ]);
  });

  it("orders hydrated and live rows on screen without changing the active turn's dispatch order", () => {
    const active = { ...agent("z-live", "build"), timestamp: 2000, role: "user" as const };
    const reply = { ...agent("a-reply", "build"), timestamp: 2000 };
    const later = { ...agent("other-tab", "build"), timestamp: 3000, hydrated: true };
    const storeRows = [later, reply, active];
    expect(ids(buildUnifiedTimeline([builder("build")], storeRows))).toEqual([
      "builder:build", "agent:z-live", "agent:a-reply", "agent:other-tab",
    ]);
    expect(storeRows.map((row) => row.id)).toEqual(["other-tab", "a-reply", "z-live"]);
  });

  it("hanterar en tom builderchatt", () => {
    const entries = buildUnifiedTimeline([], [agent("q", null), agent("r", "x", 1)]);
    expect(ids(entries)).toEqual(["agent:q", "agent:r"]);
  });
});
