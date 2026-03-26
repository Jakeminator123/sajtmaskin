-- K-019: persist last successful generation orchestration hints for follow-up turns (no secrets).
ALTER TABLE engine_chats ADD COLUMN IF NOT EXISTS orchestration_snapshot JSONB;
