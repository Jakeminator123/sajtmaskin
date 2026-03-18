CREATE TABLE IF NOT EXISTS generation_telemetry (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES engine_chats(id),
  version_id TEXT REFERENCES engine_versions(id),
  scaffold_id TEXT,
  scaffold_alternatives JSONB,
  model TEXT NOT NULL,
  model_tier TEXT,
  build_intent TEXT,
  build_method TEXT,
  prompt_classification TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  autofix_applied BOOLEAN NOT NULL DEFAULT FALSE,
  syntax_fixer_used BOOLEAN NOT NULL DEFAULT FALSE,
  preflight_error_count INTEGER NOT NULL DEFAULT 0,
  preflight_warning_count INTEGER NOT NULL DEFAULT 0,
  seo_issue_count INTEGER NOT NULL DEFAULT 0,
  preview_success BOOLEAN,
  preview_blocking_reason TEXT,
  quality_gate_result TEXT,
  deploy_result TEXT,
  duration_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  file_count INTEGER,
  scaffold_retry_used BOOLEAN NOT NULL DEFAULT FALSE,
  scaffold_retry_suggested TEXT,
  user_feedback TEXT,
  meta JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gen_telemetry_chat ON generation_telemetry(chat_id);
CREATE INDEX idx_gen_telemetry_version ON generation_telemetry(version_id);
CREATE INDEX idx_gen_telemetry_scaffold ON generation_telemetry(scaffold_id);
CREATE INDEX idx_gen_telemetry_created ON generation_telemetry(created_at);
