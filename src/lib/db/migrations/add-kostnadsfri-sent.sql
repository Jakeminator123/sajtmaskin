-- Utskicksregister för kostnadsfri-länkar: när mejlet gick ut och från vilken
-- källa (externt Python-verktyg, admin, manuellt). Egna kolumner i stället för
-- `extra_data`, eftersom extra_data läcker till klienten efter lyckad
-- lösenordsverifiering (`extractCompanyData`).
ALTER TABLE kostnadsfri_pages
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

ALTER TABLE kostnadsfri_pages
  ADD COLUMN IF NOT EXISTS source TEXT;
