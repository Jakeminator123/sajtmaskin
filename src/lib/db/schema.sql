-- =============================================================================
-- Sajtmaskin egen motor — SQLite schema
-- Tables: chats, messages, versions, generation_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  model TEXT NOT NULL DEFAULT 'gpt-5.2',
  system_prompt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL CHECK(role IN ('system','user','assistant','thinking')),
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  message_id TEXT REFERENCES messages(id),
  version_number INTEGER NOT NULL,
  files_json TEXT NOT NULL,
  sandbox_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS generation_logs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  duration_ms INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_versions_chat ON versions(chat_id);
CREATE INDEX IF NOT EXISTS idx_gen_logs_chat ON generation_logs(chat_id);
