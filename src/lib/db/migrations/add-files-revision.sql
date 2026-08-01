-- Innehållsrevision (2026-07-29) — steg 1 + 2. Initiativet är levererat och
-- indexerat i docs/plans/avklarat/README.md ("Innehållsrevision för verdikt
-- och kvitton"); kontraktet ägs av scripts/db/files-revision-contract.postgres.test.ts
-- + docs/schemas/quality-gate.md.
--
-- Problemet: `versionId` är ingen innehållsidentitet. Samma rad skrivs om av
-- user-edit (/files), server-repair (targetVersionId-rewrite) och autofix, så
-- ett verdikt kan beskriva ett tidigare innehåll utan att någon läsare kan
-- upptäcka det.
--
-- Steg 1: `engine_versions.files_revision` som DB-GENERERAD md5 av files_json.
-- Genererad, inte app-stämplad, eftersom minst fem vägar skriver files_json
-- (updateVersionFiles, saveRepairedFiles, acceptRepair, insertDraftVersionRow,
-- addAssistantMessageAndUpdateVersion) — en app-sidig stämpel skulle bygga
-- samma glömbarhets-bugg en nivå upp. `md5(text)` är IMMUTABLE och duger i en
-- genererad kolumn; `sha256(convert_to(...))` gör det inte, vilket är varför
-- den här kolumnen INTE delar värde med `hashFilesJson` (sha256), som äger
-- repair-revisionsbindningen och lämnas i fred.
--
-- STORED backfillar alla befintliga rader vid ADD COLUMN, så ingen version
-- saknar revision. Omskrivningen tar ACCESS EXCLUSIVE — mätt i prod 2026-07-29
-- före migrationen: 133 rader, 48 kB heap (allt tungt ligger i TOAST), så
-- omskrivningen är försumbar och den trigger-variant planen höll öppen behövs
-- inte.
--
-- Steg 2: `generation_telemetry.files_revision` bär den revision verdiktet
-- faktiskt bedömde. Nullbar med flit: en rad utan revision betyder "okänd" och
-- behåller dagens fail-open (beslut 1b i planen). Inget läsarbeteende ändras i
-- den här migrationen — det är steg 3, som väntar på mätdata.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'engine_versions'
      AND column_name = 'files_revision'
  ) THEN
    ALTER TABLE engine_versions
      ADD COLUMN files_revision TEXT GENERATED ALWAYS AS (md5(files_json)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'generation_telemetry'
      AND column_name = 'files_revision'
  ) THEN
    ALTER TABLE generation_telemetry ADD COLUMN files_revision TEXT;
  END IF;
END $$;

-- Steg 3 läser "senaste verdiktet för DEN HÄR revisionen", inte "senaste
-- verdiktet för versionen". Indexet gör den frågan billig innan den finns.
CREATE INDEX IF NOT EXISTS idx_generation_telemetry_version_revision
  ON generation_telemetry(version_id, files_revision);
