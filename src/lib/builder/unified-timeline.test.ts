import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import { buildUnifiedTimeline } from "./unified-timeline";

function builder(id: string): ChatMessage {
  return { id, role: "user", content: id };
}

function agent(id: string, anchorBuilderMessageId: string | null): OpenClawMessage {
  return { id, role: "assistant", content: id, timestamp: 0, anchorBuilderMessageId };
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

  it("lägger rader utan ankare först och rader med okänt ankare sist", () => {
    const entries = buildUnifiedTimeline(
      [builder("u1")],
      [agent("orphan", "gone"), agent("first", null)],
    );
    expect(ids(entries)).toEqual(["agent:first", "builder:u1", "agent:orphan"]);
  });

  it("hanterar en tom builderchatt", () => {
    const entries = buildUnifiedTimeline([], [agent("q", null), agent("r", "x")]);
    expect(ids(entries)).toEqual(["agent:q", "agent:r"]);
  });
});
