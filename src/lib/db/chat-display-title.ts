/**
 * Display title for `engine_chats`.
 *
 * `engine_chats.title` is never written. The live name lives on
 * `app_projects.name` (`engine_chats.project_id` → `app_projects.id`).
 * Keep this in lockstep with `scripts/db/lib/chat-display-title.mjs`.
 */

export const CHAT_DISPLAY_TITLE_EXCERPT_LENGTH = 80;

export function excerptFirstUserPrompt(content: string | null | undefined): string | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length <= CHAT_DISPLAY_TITLE_EXCERPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, CHAT_DISPLAY_TITLE_EXCERPT_LENGTH - 1)}…`;
}

export function resolveChatDisplayTitle(input: {
  title?: string | null;
  projectName?: string | null;
  firstUserPrompt?: string | null;
}): string | null {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title) return title;
  const projectName = typeof input.projectName === "string" ? input.projectName.trim() : "";
  if (projectName) return projectName;
  return excerptFirstUserPrompt(input.firstUserPrompt);
}
