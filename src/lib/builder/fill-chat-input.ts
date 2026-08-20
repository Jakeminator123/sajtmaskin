export const FILL_CHAT_INPUT_EVENT = "sajtmaskin:fill-chat-input";

export type FillChatInputDetail = {
  text: string;
};

/** Fill the builder chat composer without sending. Used by live-review suggestions. */
export function fillChatInput(text: string): void {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  if (!trimmed) return;
  window.dispatchEvent(
    new CustomEvent<FillChatInputDetail>(FILL_CHAT_INPUT_EVENT, { detail: { text: trimmed } }),
  );
}
