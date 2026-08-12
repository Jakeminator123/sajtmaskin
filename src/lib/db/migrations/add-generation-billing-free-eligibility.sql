-- Follow-up for databases that already recorded add-generation-billing.sql.
-- A billing marker created solely for historical/imported post-processing must
-- not consume the account's one free completed site generation.

ALTER TABLE generation_billings
  ADD COLUMN IF NOT EXISTS free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE;
