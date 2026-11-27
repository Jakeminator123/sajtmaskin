/**
 * Gemensam tidslinje för builderchatten: byggmotorns meddelanden och
 * Sajtagentens meddelanden i en lista.
 *
 * Den säkraste placeringen är ankaret: varje förankrad agentrad bär id:t på builderns senaste
 * meddelande när agentraden skapades (`anchorBuilderMessageId`) och, som
 * fallback, hur många buildermeddelanden som fanns då
 * (`anchorBuilderMessageIndex`). Byggradernas id kan bytas ut när historiken
 * hydreras från servern eller öppnas i en annan webbläsare; positionen består.
 *
 * Placering:
 * - ankar-id finns i listan → direkt efter det meddelandet,
 * - annars position `n` → efter buildermeddelande nummer `n` (0 = först),
 * - ankare `null` utan position → först (chatten var tom),
 * - rad utan träffbart ankare eller position → på sin tid om den är känd, annars sist.
 */

import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";

export type UnifiedTimelineEntry =
  | { kind: "builder"; message: ChatMessage; index: number }
  | { kind: "agent"; message: OpenClawMessage };

type Placement = { kind: "leading" } | { kind: "after"; index: number } | { kind: "trailing" };

function builderTime(message: ChatMessage): number {
  if (message.createdAt) {
    const time = Date.parse(message.createdAt);
    if (Number.isFinite(time)) return time;
  }
  // Messages cached by earlier clients kept only the optimistic id and its creation time.
  const optimistic = /^(?:user|assistant)-(\d{13})$/.exec(message.id);
  return optimistic ? Number(optimistic[1]) : NaN;
}

function placeAgentMessage(
  message: OpenClawMessage,
  indexById: ReadonlyMap<string, number>,
  builderTimes: readonly number[],
): Placement {
  const anchorId = message.anchorBuilderMessageId;
  if (typeof anchorId === "string") {
    const index = indexById.get(anchorId);
    if (index !== undefined) return { kind: "after", index };
  }
  const position = message.anchorBuilderMessageIndex;
  if (typeof position === "number" && Number.isFinite(position)) {
    if (position <= 0) return { kind: "leading" };
    if (position - 1 < builderTimes.length) return { kind: "after", index: position - 1 };
    return { kind: "trailing" };
  }
  if (anchorId === null) return { kind: "leading" };
  if (Number.isFinite(message.timestamp) && message.timestamp > 0) {
    const next = builderTimes.findIndex((time) => time > message.timestamp);
    if (next === 0) return { kind: "leading" };
    if (next > 0) return { kind: "after", index: next - 1 };
  }
  return { kind: "trailing" };
}

export function buildUnifiedTimeline(
  builderMessages: readonly ChatMessage[],
  agentMessages: readonly OpenClawMessage[],
): UnifiedTimelineEntry[] {
  if (agentMessages.length === 0) {
    return builderMessages.map((message, index) => ({ kind: "builder", message, index }));
  }

  const indexById = new Map(builderMessages.map((message, index) => [message.id, index]));
  const builderTimes = builderMessages.map(builderTime);
  const leading: OpenClawMessage[] = [];
  const trailing: OpenClawMessage[] = [];
  const afterIndex = new Map<number, OpenClawMessage[]>();

  // Hydration keeps the live turn last for dispatch. Only the display uses wall-clock order.
  const chronologicalAgents = [...agentMessages].sort((a, b) =>
    a.timestamp - b.timestamp || Number(a.role === "assistant") - Number(b.role === "assistant"),
  );
  for (const message of chronologicalAgents) {
    const placement = placeAgentMessage(message, indexById, builderTimes);
    if (placement.kind === "leading") {
      leading.push(message);
    } else if (placement.kind === "trailing") {
      trailing.push(message);
    } else {
      const group = afterIndex.get(placement.index);
      if (group) group.push(message);
      else afterIndex.set(placement.index, [message]);
    }
  }

  const entries: UnifiedTimelineEntry[] = leading.map((message) => ({
    kind: "agent" as const,
    message,
  }));
  builderMessages.forEach((message, index) => {
    entries.push({ kind: "builder", message, index });
    const group = afterIndex.get(index);
    if (group) {
      for (const agentMessage of group) entries.push({ kind: "agent", message: agentMessage });
    }
  });
  for (const message of trailing) entries.push({ kind: "agent", message });
  return entries;
}
