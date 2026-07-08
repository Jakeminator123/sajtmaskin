CREATE TABLE IF NOT EXISTS version_comments (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES engine_versions(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id),
  user_id TEXT,
  author_name TEXT,
  content TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS version_approvals (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES engine_versions(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id),
  user_id TEXT,
  approver_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_version_comments_version ON version_comments(version_id);
CREATE INDEX IF NOT EXISTS idx_version_comments_chat ON version_comments(chat_id);
CREATE INDEX IF NOT EXISTS idx_version_approvals_version ON version_approvals(version_id);
CREATE INDEX IF NOT EXISTS idx_version_approvals_chat ON version_approvals(chat_id);
