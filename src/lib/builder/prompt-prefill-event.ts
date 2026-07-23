/**
 * Cross-panel prompt prefill.
 *
 * The builder's empty state (preview panel) offers example prompts, but the
 * chat input state lives inside `ChatInterface`. Instead of threading a
 * setter through the whole shell, the example chips dispatch this DOM event
 * and `ChatInterface` listens for it — same pattern as the inspect-capture
 * events in `inspect-events.ts`.
 */
export const PROMPT_PREFILL_EVENT = "sajtmaskin:prompt-prefill";

export interface PromptPrefillEventDetail {
  text: string;
}

export function dispatchPromptPrefill(text: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PromptPrefillEventDetail>(PROMPT_PREFILL_EVENT, { detail: { text } }),
  );
  // Bekvämlighet: flytta fokus till chattens textarea så användaren kan
  // redigera/skicka direkt.
  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLTextAreaElement>('[data-openclaw-text-target="builder.chat.primary"]')
      ?.focus();
  });
}
