-- Follow-up for databases that already recorded add-generation-billing.sql
-- before durable request attribution was added. The base migration also owns
-- this column for fresh databases; this filename makes the additive ALTER run
-- once on already-migrated environments.

ALTER TABLE generation_billings
  ADD COLUMN IF NOT EXISTS claim_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
