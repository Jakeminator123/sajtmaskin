/**
 * Follow-up chat history compression.
 *
 * The authoritative project state is delivered through the
 * `## Current Project Files` block in the user-turn. Historical assistant
 * CodeProject output (with full file blocks) only duplicates that payload
 * and eats prompt budget. We keep short assistant messages untouched, we
 * keep the MOST RECENT assistant turn untouched (it may carry prose tied
 * to the current follow-up), and we compress every earlier code-heavy
 * assistant turn down to a prose-prefix + file-list summary.
 *
 * Extracted from `chat-message-stream-post.ts` so unit tests don't pull in
 * the whole streaming/DB surface.
 */

import { FOLLOW_UP_TUNING } from "@/lib/config";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

const CODE_BLOCK_HEAVY_THRESHOLD = 500;

/**
 * Preserve assistant prose that precedes the first file block (design
 * rationale like "I chose glassmorphism to match your premium theme").
 * Drop the full CodeProject file blocks — the latest versions are already
 * in the `## Current Project Files` block of the user-turn.
 */
export function compressOldAssistantContent(content: string): string {
  if (content.length < CODE_BLOCK_HEAVY_THRESHOLD) return content;
  const fileMatches = [...content.matchAll(/file="([^"]+)"/g)].map((m) => m[1]);
  const firstFileIdx = content.search(/file="/);
  const proseHead = (firstFileIdx > 0 ? content.slice(0, firstFileIdx) : content.slice(0, 800)).trim();
  if (fileMatches.length === 0) {
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    if (codeBlocks < 1) return content;
    return proseHead + "\n\n[Earlier code blocks truncated — see current project files for latest version.]";
  }
  const fileSummary = `${fileMatches.slice(0, 8).join(", ")}${fileMatches.length > 8 ? ` (+${fileMatches.length - 8} more)` : ""}`;
  return `${proseHead}\n\n[Earlier code generation: ${fileSummary}. Current project files contain the latest version.]`;
}

export function buildBoundedChatHistory(
  messages: Array<{ role: string; content: string }>,
): HistoryMessage[] {
  const filtered = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const recentCount = FOLLOW_UP_TUNING.maxRecentHistoryPairs * 2;
  let lastAssistantIdx = -1;
  for (let i = filtered.length - 1; i >= 0; i--) {
    if (filtered[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  const compressed = filtered.map((message, idx) => {
    if (message.role !== "assistant") return message;
    if (idx === lastAssistantIdx) return message;
    return { ...message, content: compressOldAssistantContent(message.content) };
  });
  if (compressed.length <= recentCount) return compressed;
  // Anchor the window so `lastAssistantIdx` (the preserved full assistant
  // turn) can never be sliced off. Without this a pathological history
  // shape — `recentCount` or more user-only turns after the last assistant
  // — would drop the very turn we just went to the trouble of keeping.
  // `engineChat.messages` is cached before addMessage runs today, so the
  // list currently ends on an assistant turn in production, but we should
  // not rely on that ordering contract.
  if (lastAssistantIdx < 0) {
    return compressed.slice(-recentCount);
  }
  const defaultStart = compressed.length - recentCount;
  const windowStart = Math.min(defaultStart, lastAssistantIdx);
  return compressed.slice(windowStart);
}
