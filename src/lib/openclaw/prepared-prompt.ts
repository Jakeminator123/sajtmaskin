/**
 * OpenClaw "prepared prompt" fast lane (opt-in, gated on OC_EDIT).
 *
 * When OpenClaw's armed autonomy fills the builder composer
 * (`fill_text_field` → `builder.chat.primary`) and that exact content is
 * sent, the follow-up request is tagged `promptSource: "openclaw-prepared"`.
 * The server may then skip the clear-redesign delta-brief LLM pass
 * (`delta-brief-phase.ts`) — the prompt is already structured, so the extra
 * structuring round is redundant latency + tokens. Every check in here is
 * deterministic (no LLM) and every failure falls open to today's flow.
 *
 * NOTE: distinct from the existing `meta.promptSourceKind` (prompt-builder
 * envelope kinds: shadcn/autofix/…) and from `strategyMeta.promptSource`
 * ("user" | "auto_repair"). This tag is a top-level request-body field and
 * only ever carries the single value below.
 */

/** Request-body tag value for an OpenClaw-prepared, unedited composer send. */
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
 * Deterministic structure gate for the server-side skip decision. Mirrors the
 * signals the delta-brief LLM pass produces (a brief is titled sections with
 * bullet lists — see `siteBriefSchema` in `site-brief-generation.ts`): the
 * prepared prompt must carry equivalent structure to stand in for it.
 *
 * Structural line tokens only (`#`, `-`, digits, `:`), so plain regex is safe
 * for Swedish text — no `\b`/`\w` word matching (see unicode-regex.mdc).
 */
const MIN_PREPARED_PROMPT_CHARS = 200;
const MIN_SECTION_SIGNALS = 2;
const MIN_BULLET_LINES = 3;

/** Markdown heading (`# Rubrik` … `###### Rubrik`). */
const HEADING_LINE = /^#{1,6}\s+\S/;
/** Bold-only label line (`**Design**` / `**Design:**`). */
const BOLD_LABEL_LINE = /^\*\*[^*]{1,80}\*\*:?$/;
/** Short label line ending with a colon (`Sektioner:`), max 80 chars. */
const COLON_LABEL_LINE = /^\S[^\n]{0,78}:$/;
/** Bullet line (`- x`, `* x`, `• x`). */
const BULLET_LINE = /^[-*•]\s+\S/;
/** Numbered list line (`1. x`, `2) x`). */
const NUMBERED_LINE = /^\d{1,2}[.)]\s+\S/;

/**
 * Cheap deterministic check that a prepared prompt is structured enough to
 * replace the delta-brief pass: minimum length, at least two section signals
 * (headings / label lines) and at least three list items. Anything below the
 * bar fails the fast lane and takes today's LLM path instead (fail-open).
 */
export function isOpenClawPreparedPromptStructured(prompt: string): boolean {
  const trimmed = typeof prompt === "string" ? prompt.trim() : "";
  if (trimmed.length < MIN_PREPARED_PROMPT_CHARS) return false;

  let sectionSignals = 0;
  let bulletLines = 0;
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (HEADING_LINE.test(line) || BOLD_LABEL_LINE.test(line) || COLON_LABEL_LINE.test(line)) {
      sectionSignals += 1;
      continue;
    }
    if (BULLET_LINE.test(line) || NUMBERED_LINE.test(line)) {
      bulletLines += 1;
    }
  }

  return sectionSignals >= MIN_SECTION_SIGNALS && bulletLines >= MIN_BULLET_LINES;
}

/**
 * Client-side tag decision, called by the builder composer at send time.
 * Returns the tag ONLY when every condition holds:
 *
 *  - the store's `editEnabled` (server-reported OC_EDIT) is true,
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
