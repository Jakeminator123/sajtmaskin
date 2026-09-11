-- Operatörsstyrd prisbild: domänpåslag, domänens USD/SEK-kurs och de fasta
-- creditpriserna. Singleton med id = 'default'.
--
-- Medvetet EGEN tabell, inte nya kolumner på generation_billing_settings: den
-- ägs av den usage-baserade LLM-avräkningen och dess värden fryses per
-- generering i generation_billings. De två USD/SEK-kurserna är olika saker —
-- generation_billing_settings.usd_to_sek_ore är revisionskurs för
-- leverantörskostnad, domain_usd_to_sek_ore omvandlar registrarens USD-offert
-- till en visad SEK-siffra.
--
-- Heltalsenheter som resten av prisdatan: basis points (X5 = 50000) och öre
-- (11,00 kr = 1100). Seedvärdena är exakt dagens hårdkodade prisbild, så
-- migrationen ensam ändrar ingen debitering.

CREATE TABLE IF NOT EXISTS pricing_settings (
  id TEXT PRIMARY KEY,
  domain_markup_basis_points INTEGER NOT NULL DEFAULT 50000
    CHECK (domain_markup_basis_points BETWEEN 10000 AND 100000),
  domain_usd_to_sek_ore INTEGER NOT NULL DEFAULT 1100
    CHECK (domain_usd_to_sek_ore BETWEEN 100 AND 10000),
  -- Delmängd av CreditActionPrices. Formvalideras med zod i
  -- src/lib/db/services/pricing-settings.ts; utelämnade eller ogiltiga fält
  -- faller tillbaka på konstanterna i src/lib/credits/pricing.ts.
  credit_action_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pricing_settings (
  id, domain_markup_basis_points, domain_usd_to_sek_ore, credit_action_prices
)
VALUES (
  'default',
  50000,
  1100,
  '{
    "promptCreate": {"premium": 10, "pro": 7, "max": 10, "codex": 10, "anthropic": 10},
    "promptRefine": {"premium": 6, "pro": 4, "max": 6, "codex": 6, "anthropic": 6},
    "wizard": 11,
    "auditBasic": 15,
    "auditAdvanced": 25,
    "deployPreview": 20,
    "deployProduction": 20,
    "openclawTip": 2
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'pricing_settings'
        AND policyname = 'pricing_settings_backend_full_access'
    ) THEN
      CREATE POLICY pricing_settings_backend_full_access
        ON pricing_settings
        FOR ALL TO postgres, service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
