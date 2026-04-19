-- Lägg till FK + ON DELETE CASCADE på engine_chats.project_id så hela
-- delete-kedjan fungerar uppifrån (app_projects → engine_chats → engine_*).
--
-- Fram till nu var engine_chats.project_id en text-kolumn utan FK, vilket
-- ledde till "soft-orphans" varje gång ett projekt raderades via UI:t (UI-
-- routen rensade project_data/project_files/images/company_profiles men
-- missade engine_chats helt). Resultat: dangling engine_chats med pekare
-- till för länge sen raderade app_projects.
--
-- Steg 1: Rensa befintliga orphans (annars vägrar Postgres lägga till FK).
--          Cascade nedströms (engine_messages, engine_versions, telemetri,
--          comments, approvals etc) sköts automatiskt av FK:erna som lades
--          till i add-cascade-to-engine-fks.sql.
-- Steg 2: Lägg till FK + ON DELETE CASCADE.
--
-- Idempotent: säker att köra flera gånger.

-- Steg 1
DELETE FROM engine_chats ec
WHERE ec.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app_projects p WHERE p.id = ec.project_id
  );

-- Steg 2
ALTER TABLE engine_chats
  DROP CONSTRAINT IF EXISTS engine_chats_project_id_fkey;
ALTER TABLE engine_chats
  ADD CONSTRAINT engine_chats_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES app_projects(id) ON DELETE CASCADE;
