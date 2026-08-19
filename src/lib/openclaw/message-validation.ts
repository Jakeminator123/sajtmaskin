export interface ValidatedOpenClawChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type OpenClawMessageValidationResult =
  | { ok: true; messages: ValidatedOpenClawChatMessage[] }
  | { ok: false; error: string };

/** Shared with the client payload normalizer — keep these in lockstep. */
export const OPENCLAW_CHAT_MAX_MESSAGES = 40;
export const OPENCLAW_CHAT_MAX_CONTENT_CHARS = 8_000;

export type OpenClawClientMessageLike = {
  role: string;
  content: string;
};

/**
 * Client-side payload shape that the server will accept. Drops empty
 * assistant placeholders (stop-before-token), keeps the newest messages
 * inside the 40-item cap, and truncates overlong content.
 */
export function normalizeOpenClawClientMessages(
  messages: OpenClawClientMessageLike[],
): ValidatedOpenClawChatMessage[] {
  const cleaned: ValidatedOpenClawChatMessage[] = [];
  for (const item of messages) {
    if (item.role !== "user" && item.role !== "assistant") continue;
    const content = item.content.trim()
      ? item.content.length > OPENCLAW_CHAT_MAX_CONTENT_CHARS
        ? item.content.slice(0, OPENCLAW_CHAT_MAX_CONTENT_CHARS)
        : item.content
      : "";
    if (!content) continue;
    cleaned.push({ role: item.role, content });
  }
  if (cleaned.length <= OPENCLAW_CHAT_MAX_MESSAGES) return cleaned;
  return cleaned.slice(-OPENCLAW_CHAT_MAX_MESSAGES);
}

/** Runtime validation for the public chat route. TypeScript interfaces do not
 * validate JSON, and client-supplied system roles would otherwise become
 * trusted gateway instructions. */
export function validateOpenClawChatMessages(
  value: unknown,
): OpenClawMessageValidationResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "messages required" };
  }
  if (value.length > OPENCLAW_CHAT_MAX_MESSAGES) {
    return { ok: false, error: `messages may contain at most ${OPENCLAW_CHAT_MAX_MESSAGES} items` };
  }

  const messages: ValidatedOpenClawChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "each message must be an object" };
    }
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "client message role must be user or assistant" };
    }
    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, error: "message content must be a non-empty string" };
    }
    if (content.length > OPENCLAW_CHAT_MAX_CONTENT_CHARS) {
      return {
        ok: false,
        error: `message content may contain at most ${OPENCLAW_CHAT_MAX_CONTENT_CHARS} characters`,
      };
    }
    messages.push({ role, content });
  }

  return { ok: true, messages };
}
