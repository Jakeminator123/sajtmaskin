/**
 * Phase 2D — `### Recurring failures on this site` block.
 *
 * Reads `logs/site-observability/<chatId>/latest/fix-patterns.json` and
 * renders a concise list so the MAIN generator (not just the fixer) sees
 * that it just made the same mistake last time. Capped at 5 patterns +
 * 600 chars; falls silently when budget or signal is missing.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { readRecurringPatternsForChat } from "@/lib/logging/recurring-patterns-reader";

const RECURRING_BLOCK_MAX_PATTERNS = 5;
const RECURRING_BLOCK_MAX_CHARS = 600;
const RECURRING_BLOCK_MIN_OCCURRENCES = 2;

export function renderRecurringFailuresBlockLines(
  chatId: string | null | undefined,
): string[] {
  if (!chatId) return [];
  let patterns: ReturnType<typeof readRecurringPatternsForChat>;
  try {
    patterns = readRecurringPatternsForChat(chatId);
  } catch {
    return [];
  }
  const eligible = patterns
    .filter((p) => p.occurrences >= RECURRING_BLOCK_MIN_OCCURRENCES)
    .slice(0, RECURRING_BLOCK_MAX_PATTERNS);
  if (eligible.length === 0) return [];
  const header = "### Recurring failures on this site";
  const intro =
    "These mistakes already happened on this site in earlier generations. " +
    "Do NOT repeat them. The mechanical autofix and LLM-fixer have already " +
    "patched them once; emitting them again costs another repair pass.";
  const items = eligible.map((p) => {
    const fileBit =
      p.files && p.files.length > 0 ? ` — files: ${p.files
        .slice(0, 2)
        .map((f) => `\`${f.file}\``)
        .join(", ")}` : "";
    const exBit = p.example ? ` — last example: ${p.example.slice(0, 80)}` : "";
    return `- \`${p.pattern}\` (×${p.occurrences})${fileBit}${exBit}`;
  });
  const block = [header, "", intro, "", ...items, ""];
  // Char-cap: cut from the bottom item-by-item until under budget so the
  // header/intro always survives.
  while (block.join("\n").length > RECURRING_BLOCK_MAX_CHARS && block.length > 4) {
    // Pop the last item (which is just before the trailing empty string).
    block.splice(block.length - 2, 1);
  }
  return block;
}
