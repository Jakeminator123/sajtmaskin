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
