ALTER TABLE generation_telemetry
  ADD COLUMN IF NOT EXISTS scaffold_selection_method TEXT;

ALTER TABLE generation_telemetry
  ADD COLUMN IF NOT EXISTS scaffold_selection_confidence TEXT;

ALTER TABLE generation_telemetry
  ADD COLUMN IF NOT EXISTS brief_influenced_selection BOOLEAN NOT NULL DEFAULT FALSE;
