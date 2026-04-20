-- Persist concatenated reasoning text on assistant messages so the
-- builder UI can re-render the "thinking" panel after a page refresh,
-- not only during the live stream. Nullable: user messages and
-- responses without reasoning deltas leave it NULL.
ALTER TABLE engine_messages ADD COLUMN IF NOT EXISTS thinking TEXT;
