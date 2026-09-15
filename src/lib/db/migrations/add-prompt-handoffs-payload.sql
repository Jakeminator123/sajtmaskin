-- Structured audit handoff payload. Stays server-side; clients only see
-- payloadKind + domain via GET /api/prompts/[id].
ALTER TABLE prompt_handoffs
  ADD COLUMN IF NOT EXISTS payload JSONB;
