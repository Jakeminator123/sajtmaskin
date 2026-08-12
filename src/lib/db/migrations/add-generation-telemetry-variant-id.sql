ALTER TABLE generation_telemetry
  ADD COLUMN IF NOT EXISTS variant_id TEXT;
