/**
 * Tooling-kopia av `src/lib/db/chat-display-title.ts`.
 *
 * `engine_chats.title` skrivs aldrig. Visningsnamnet är `app_projects.name`
 * via `engine_chats.project_id`, därefter första user-promptens inledning.
 * Node-skript kan inte importera TS-ägaren — ändra inte ordningen här
 * utan att sprida den.
 */

export const CHAT_DISPLAY_TITLE_EXCERPT_LENGTH = 80;

export function excerptFirstUserPrompt(content) {
  if (typeof content !== "string") return null;
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length <= CHAT_DISPLAY_TITLE_EXCERPT_LENGTH) return trimmed;
  return `${trimmed.slice(0, CHAT_DISPLAY_TITLE_EXCERPT_LENGTH - 1)}…`;
}

export function resolveChatDisplayTitle({ title, projectName, firstUserPrompt } = {}) {
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (trimmedTitle) return trimmedTitle;
  const trimmedProject = typeof projectName === "string" ? projectName.trim() : "";
  if (trimmedProject) return trimmedProject;
  return excerptFirstUserPrompt(firstUserPrompt);
}

/**
 * Trusted aliases only — never interpolate user input.
 * `chatAlias.title`, `projectAlias.name`, `promptAlias.content`.
 */
export function chatDisplayTitleSql({
  chatAlias = "c",
  projectAlias = "p",
  promptAlias = "first_user",
} = {}) {
  return `COALESCE(
    NULLIF(BTRIM(${chatAlias}.title), ''),
    NULLIF(BTRIM(${projectAlias}.name), ''),
    NULLIF(LEFT(BTRIM(${promptAlias}.content), ${CHAT_DISPLAY_TITLE_EXCERPT_LENGTH}), '')
  )`;
}

/** Trusted `chatIdExpr` only — never interpolate user input. */
export function firstUserPromptLateralSql(chatIdExpr = "c.id", alias = "first_user") {
  return `
LEFT JOIN LATERAL (
  SELECT content
  FROM engine_messages
  WHERE chat_id = ${chatIdExpr} AND role = 'user'
  ORDER BY created_at ASC
  LIMIT 1
) ${alias} ON true`;
}
