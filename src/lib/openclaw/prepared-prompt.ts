/**
 * A prepared-send tag identifies an unedited composer fill. It is a request
 * hint and carries no authority. The delta-brief phase independently validates
 * a complete siteBriefSchema JSON object from the same current message before
 * reusing it. Formatted prose takes the normal typed delta-brief path.
 *
 * OPENCLAW.editEnabled controls rollout. The tag changes no intent,
 * permissions, version creation, credits or verification checks.
 * This top-level tag is separate from meta.promptSourceKind and strategyMeta.
 */
/**
 * Request-body tag value for an unedited composer send that OpenClaw filled.
 * A hint that the prompt is already brief-shaped — see the trust model above.
 */
export const OPENCLAW_PREPARED_PROMPT_SOURCE = "openclaw-prepared" as const;

export type OpenClawPreparedPromptSource = typeof OPENCLAW_PREPARED_PROMPT_SOURCE;

/**
 * The builder composer's OpenClaw text-field target (the literal also sits in
 * the `data-openclaw-text-target` attribute in `ChatInterface.tsx` and in the
 * gateway's edit system prompt). Only fills against THIS target may tag.
 */
export const OPENCLAW_BUILDER_CHAT_TARGET = "builder.chat.primary";

/** Last successful OpenClaw fill of the builder composer (client store state). */
export interface OpenClawPreparedFill {
  target: string;
  value: string;
}

/**
 * Whether an outgoing builder send is the one OpenClaw filled into the composer.
 * Deliberately looser than `resolveOpenClawPreparedPromptSource`: that decides
 * whether to TAG a send and must drop on anything that changed the text, while
 * this only asks WHO started it, so the armed handshake can bind the refusal id
 * of its own turn. A prefix match therefore counts — the composer appends
 * Figma/inspect blocks after the base message — but a catalogue pick, a shadcn
 * insert or a hand-typed message never matches, so none of them can claim a
 * watch that is still waiting for its own send.
 */
export function isOpenClawPreparedSend(params: {
  preparedFill: OpenClawPreparedFill | null;
  message: string;
}): boolean {
  const { preparedFill, message } = params;
  if (preparedFill?.target !== OPENCLAW_BUILDER_CHAT_TARGET) return false;
  const filled = preparedFill.value.trim();
  if (!filled) return false;
  return message.trim().startsWith(filled);
}

/**
 * Client-side tag decision, called by the builder composer at send time.
 * Returns the tag ONLY when every condition holds:
 *
 *  - the user has granted an extra power (OC_EDIT AND the chat's button and
 *    menu — the composer passes the resolved grant, see `powers.ts`),
 *  - the last OpenClaw fill targeted the builder composer,
 *  - the outgoing message is EXACTLY the filled content (whitespace-trimmed —
 *    any user edit, appended Figma/inspect block or attachment prompt breaks
 *    equality and drops the tag),
 *  - no attachments ride along (they append prompt text server-side).
 *
 * Anything else returns null and the send behaves exactly as today.
 */
export function resolveOpenClawPreparedPromptSource(params: {
  editEnabled: boolean;
  preparedFill: OpenClawPreparedFill | null;
  message: string;
  hasAttachments: boolean;
  attachmentPrompt?: string | null;
}): OpenClawPreparedPromptSource | null {
  const { editEnabled, preparedFill, message, hasAttachments, attachmentPrompt } = params;
  if (!editEnabled || !preparedFill) return null;
  if (preparedFill.target !== OPENCLAW_BUILDER_CHAT_TARGET) return null;
  if (hasAttachments || attachmentPrompt?.trim()) return null;
  if (message.trim() !== preparedFill.value.trim()) return null;
  return OPENCLAW_PREPARED_PROMPT_SOURCE;
}
