import { getDb } from "./sqlite";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chat {
  id: string;
  project_id: string;
  title: string | null;
  model: string;
  system_prompt: string | null;
  scaffold_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "system" | "user" | "assistant" | "thinking";
  content: string;
  ui_parts?: Record<string, unknown>[] | null;
  token_count: number | null;
  created_at: string;
}

export interface Version {
  id: string;
  chat_id: string;
  message_id: string | null;
  version_number: number;
  files_json: string;
  sandbox_url: string | null;
  created_at: string;
}

export interface GenerationLog {
  id: string;
  chat_id: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  success: number;
  error_message: string | null;
  created_at: string;
}

export interface VersionErrorLog {
  id: string;
  chat_id: string;
  version_id: string;
  level: "info" | "warning" | "error";
  category: string | null;
  message: string;
  meta: string | null;
  created_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return crypto.randomUUID();
}

function parseUiParts(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) {
    return value.filter(
      (part): part is Record<string, unknown> => Boolean(part) && typeof part === "object",
    );
  }
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (part): part is Record<string, unknown> => Boolean(part) && typeof part === "object",
        )
      : null;
  } catch {
    return null;
  }
}

function hydrateMessage(row: Message): Message {
  return {
    ...row,
    ui_parts: parseUiParts((row as Message & { ui_parts?: unknown }).ui_parts),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function createChat(
  projectId: string,
  model: string = "gpt-5.2",
  systemPrompt?: string,
  scaffoldId?: string,
): Chat {
  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO chats (id, project_id, model, system_prompt, scaffold_id) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, projectId, model, systemPrompt ?? null, scaffoldId ?? null);

  return db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as Chat;
}

export function getChat(id: string): ChatWithMessages | null {
  const db = getDb();
  const chat = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as Chat | undefined;
  if (!chat) return null;

  const messages = db
    .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
    .all(chat.id)
    .map((row) => hydrateMessage(row as Message));

  return { ...chat, messages };
}

export function addMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  tokenCount?: number,
  uiParts?: Record<string, unknown>[] | null,
): Message {
  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO messages (id, chat_id, role, content, ui_parts, token_count) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    chatId,
    role,
    content,
    Array.isArray(uiParts) ? JSON.stringify(uiParts) : null,
    tokenCount ?? null,
  );

  db.prepare(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`).run(chatId);

  return hydrateMessage(db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as Message);
}

export function createVersion(
  chatId: string,
  messageId: string | null,
  filesJson: string,
  sandboxUrl?: string,
): Version {
  const db = getDb();
  const id = uuid();

  const latest = db
    .prepare(
      `SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM versions WHERE chat_id = ?`,
    )
    .get(chatId) as { max_ver: number };

  const versionNumber = latest.max_ver + 1;

  db.prepare(
    `INSERT INTO versions (id, chat_id, message_id, version_number, files_json, sandbox_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, chatId, messageId, versionNumber, filesJson, sandboxUrl ?? null);

  return db.prepare(`SELECT * FROM versions WHERE id = ?`).get(id) as Version;
}

export function getLatestVersion(chatId: string): Version | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT * FROM versions WHERE chat_id = ? ORDER BY version_number DESC LIMIT 1`,
      )
      .get(chatId) as Version | undefined) ?? null
  );
}

export function listChatsByProject(projectId: string): Chat[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC`)
    .all(projectId) as Chat[];
}

export function updateChatProjectId(chatId: string, projectId: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`UPDATE chats SET project_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(projectId, chatId);
  return result.changes > 0;
}

export function updateChatScaffoldId(chatId: string, scaffoldId: string | null): boolean {
  const db = getDb();
  const result = db
    .prepare(`UPDATE chats SET scaffold_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(scaffoldId, chatId);
  return result.changes > 0;
}

export function getVersionsByChat(chatId: string): Version[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM versions WHERE chat_id = ? ORDER BY version_number DESC`)
    .all(chatId) as Version[];
}

export function getVersionById(versionId: string): Version | null {
  const db = getDb();
  return (
    (db.prepare(`SELECT * FROM versions WHERE id = ?`).get(versionId) as Version | undefined) ??
    null
  );
}

export function updateVersionFiles(versionId: string, filesJson: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`UPDATE versions SET files_json = ? WHERE id = ?`)
    .run(filesJson, versionId);
  return result.changes > 0;
}

export function createVersionErrorLogs(
  payloads: Array<{
    chatId: string;
    versionId: string;
    level: "info" | "warning" | "error";
    category?: string | null;
    message: string;
    meta?: Record<string, unknown> | null;
  }>,
): VersionErrorLog[] {
  const db = getDb();
  if (payloads.length === 0) return [];

  const insert = db.prepare(
    `INSERT INTO version_error_logs (id, chat_id, version_id, level, category, message, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const select = db.prepare(`SELECT * FROM version_error_logs WHERE id = ?`);

  return payloads.map((payload) => {
    const id = uuid();
    insert.run(
      id,
      payload.chatId,
      payload.versionId,
      payload.level,
      payload.category ?? null,
      payload.message,
      payload.meta ? JSON.stringify(payload.meta) : null,
    );
    return select.get(id) as VersionErrorLog;
  });
}

export function getVersionErrorLogs(versionId: string): Array<
  Omit<VersionErrorLog, "meta"> & { meta: Record<string, unknown> | null }
> {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM version_error_logs WHERE version_id = ? ORDER BY created_at DESC`)
    .all(versionId) as VersionErrorLog[];

  return rows.map((row) => ({
    ...row,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
  }));
}

export function logGeneration(
  chatId: string,
  model: string,
  tokens: { prompt?: number; completion?: number },
  durationMs: number,
  success: boolean,
  error?: string,
): GenerationLog {
  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO generation_logs
       (id, chat_id, model, prompt_tokens, completion_tokens, duration_ms, success, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    chatId,
    model,
    tokens.prompt ?? null,
    tokens.completion ?? null,
    durationMs,
    success ? 1 : 0,
    error ?? null,
  );

  return db.prepare(`SELECT * FROM generation_logs WHERE id = ?`).get(id) as GenerationLog;
}
