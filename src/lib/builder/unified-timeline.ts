/**
 * Gemensam tidslinje för builderchatten: byggmotorns meddelanden och
 * Sajtagentens meddelanden i en lista.
 *
 * Byggmotorns rader saknar tidsstämpel i klientens snapshot, så ordningen
 * bygger på ett ankare: varje agentrad bär id:t på builderns senaste
 * meddelande när agentraden skapades (`anchorBuilderMessageId`). Rader
 * skapade innan chatten hade några meddelanden (ankare `null`) ligger
 * först; rader vars ankare inte längre finns (historiken byttes ut) ligger
 * sist, eftersom de bevisligen kom efter något som fanns.
 */

import type { ChatMessage } from "@/lib/builder/types";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";

export type UnifiedTimelineEntry =
  | { kind: "builder"; message: ChatMessage; index: number }
  | { kind: "agent"; message: OpenClawMessage };

export function buildUnifiedTimeline(
  builderMessages: readonly ChatMessage[],
  agentMessages: readonly OpenClawMessage[],
): UnifiedTimelineEntry[] {
  if (agentMessages.length === 0) {
    return builderMessages.map((message, index) => ({ kind: "builder", message, index }));
  }

  const builderIds = new Set(builderMessages.map((message) => message.id));
  const leading: OpenClawMessage[] = [];
  const trailing: OpenClawMessage[] = [];
  const byAnchor = new Map<string, OpenClawMessage[]>();

  for (const message of agentMessages) {
    const anchor = message.anchorBuilderMessageId ?? null;
    if (anchor === null) {
      leading.push(message);
      continue;
    }
    if (!builderIds.has(anchor)) {
      trailing.push(message);
      continue;
    }
    const group = byAnchor.get(anchor);
    if (group) group.push(message);
    else byAnchor.set(anchor, [message]);
  }

  const entries: UnifiedTimelineEntry[] = leading.map((message) => ({
    kind: "agent" as const,
    message,
  }));
  builderMessages.forEach((message, index) => {
    entries.push({ kind: "builder", message, index });
    const group = byAnchor.get(message.id);
    if (group) {
      for (const agentMessage of group) entries.push({ kind: "agent", message: agentMessage });
    }
  });
  for (const message of trailing) entries.push({ kind: "agent", message });
  return entries;
}
