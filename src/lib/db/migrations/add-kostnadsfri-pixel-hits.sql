-- Pixel-träffar för kostnadsfri-mejlen (rent | animated).
-- En rad per räknad träff (30 min debounce i appen), så admin kan räkna
-- träffar inom vald period. Livstidssumma lagras inte på raden.
-- Additiv CREATE: gammal kod rör inte tabellen.
-- E-post stannar server-side; admin aggregerar per slug och kind.
CREATE TABLE IF NOT EXISTS kostnadsfri_pixel_hits (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,
  hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uppgradering av den första utkastformen (en summerad rad per mottagare med
-- hit_count/first_hit_at/last_hit_at och UNIQUE (email, slug, kind)), som redan
-- kan ligga i en databas. Den unika regeln stoppar flera träffrader och tas
-- bort. De gamla kolumnerna behålls orörda: de har defaults, så nya inserts
-- fungerar, och att ta bort dem kräver ett eget beslut.
ALTER TABLE kostnadsfri_pixel_hits
  ADD COLUMN IF NOT EXISTS hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kostnadsfri_pixel_hits_email_slug_kind_unique'
      AND conrelid = 'kostnadsfri_pixel_hits'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'kostnadsfri_pixel_hits'
      AND column_name = 'hit_count'
  ) THEN
    -- Den summerade raden blir sista träffen. Övriga hit_count - 1 träffar
    -- saknar egna tider och läggs på first_hit_at, den tidigaste kända tiden.
    ALTER TABLE kostnadsfri_pixel_hits
      DROP CONSTRAINT kostnadsfri_pixel_hits_email_slug_kind_unique;
    UPDATE kostnadsfri_pixel_hits SET hit_at = last_hit_at;
    INSERT INTO kostnadsfri_pixel_hits
      (email, slug, kind, hit_at, hit_count, first_hit_at, last_hit_at)
    SELECT email, slug, kind, first_hit_at, 1, first_hit_at, first_hit_at
    FROM kostnadsfri_pixel_hits, generate_series(2, hit_count);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_kostnadsfri_pixel_hits_slug_kind;

CREATE INDEX IF NOT EXISTS idx_kostnadsfri_pixel_hits_recipient
  ON kostnadsfri_pixel_hits (email, slug, kind, hit_at);

CREATE INDEX IF NOT EXISTS idx_kostnadsfri_pixel_hits_period
  ON kostnadsfri_pixel_hits (hit_at);

ALTER TABLE kostnadsfri_pixel_hits ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'kostnadsfri_pixel_hits'
        AND policyname = 'kostnadsfri_pixel_hits_backend_full_access'
    ) THEN
      CREATE POLICY kostnadsfri_pixel_hits_backend_full_access ON kostnadsfri_pixel_hits
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
