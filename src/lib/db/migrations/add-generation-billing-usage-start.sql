-- Follow-up for databases that already recorded add-generation-billing.sql.
-- Normal finalized generations leave this null and include all version usage.
-- A marker created before post-processing an older/imported version stores the
-- database clock here so historical usage cannot be billed as part of repair.

ALTER TABLE generation_billings
  ADD COLUMN IF NOT EXISTS usage_started_at TIMESTAMPTZ;
