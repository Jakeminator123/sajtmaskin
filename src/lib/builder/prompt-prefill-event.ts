/**
 * Cross-panel prompt prefill.
 *
 * The builder's empty state (preview panel) offers example prompts, but the
 * chat input state lives inside `ChatInterface`. Instead of threading a
 * setter through the whole shell, the example chips dispatch this DOM event
 * and `ChatInterface` listens for it — same pattern as the inspect-capture
 * events in `inspect-events.ts`.
 *
 * Two modes:
 * - Plain (no `replaceKey`): the text REPLACES the whole chat input
 *   (example prompts).
 * - Keyed (`replaceKey` set): the text is UPSERTED as its own block — the
 *   previous block dispatched under the same key is swapped out while the
 *   user's own text is left untouched (Byggval controls in the welcome
 *   state). An empty text removes the block.
 */
export const PROMPT_PREFILL_EVENT = "sajtmaskin:prompt-prefill";

export interface PromptPrefillEventDetail {
  text: string;
  /** Upsert-key: replace the previously dispatched block for this key instead of the whole input. */
  replaceKey?: string;
  /** Skip moving focus to the chat textarea (used by live-updating controls). */
  skipFocus?: boolean;
}

export interface DispatchPromptPrefillOptions {
  replaceKey?: string;
  skipFocus?: boolean;
}

export function dispatchPromptPrefill(
  text: string,
  options?: DispatchPromptPrefillOptions,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PromptPrefillEventDetail>(PROMPT_PREFILL_EVENT, {
      detail: {
        text,
        replaceKey: options?.replaceKey,
        skipFocus: options?.skipFocus,
      },
    }),
  );
  if (options?.skipFocus) return;
  // Bekvämlighet: flytta fokus till chattens textarea så användaren kan
  // redigera/skicka direkt.
  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLTextAreaElement>('[data-openclaw-text-target="builder.chat.primary"]')
      ?.focus();
  });
}

/**
 * Pure upsert used by ChatInterface for keyed prefill blocks.
 *
 * Removes `previousBlock` (when present verbatim in `current`) and appends
 * `nextBlock` as a trailing paragraph. Returns the new input value. When the
 * user has edited the previous block by hand it no longer matches verbatim
 * and is deliberately left alone — predictable beats clever here.
 */
export function upsertKeyedPromptBlock(
  current: string,
  previousBlock: string | undefined,
  nextBlock: string,
): string {
  let base = current;
  const previous = previousBlock?.trim();
  if (previous) {
    const index = base.indexOf(previous);
    if (index !== -1) {
      const before = base.slice(0, index).replace(/[ \t]*\n{0,2}$/, "");
      const after = base.slice(index + previous.length).replace(/^\n{0,2}[ \t]*/, "");
      base = before && after ? `${before}\n\n${after}` : before || after;
    }
  }
  const next = nextBlock.trim();
  if (!next) return base;
  return base.trim() ? `${base.trimEnd()}\n\n${next}` : next;
}
