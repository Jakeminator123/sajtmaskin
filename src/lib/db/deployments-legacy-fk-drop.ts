/**
 * Catalog-driven drop for deployments.chat_id / deployments.version_id FKs.
 *
 * Constraint names differ by how the DB was bootstrapped:
 * - db-init inline REFERENCES → `deployments_chat_id_fkey`
 * - Drizzle db-push → `deployments_chat_id_chats_id_fk`
 *
 * The migration and db-init both execute `DROP_DEPLOYMENTS_LEGACY_FKS_SQL` so
 * every naming variant is removed without hardcoding constraint names.
 */
export const DEPLOYMENTS_FK_DROP_COLUMNS = ["chat_id", "version_id"] as const;

export type DeploymentsFkCatalogRow = {
  table_schema: string;
  table_name: string;
  constraint_type: string;
  constraint_name: string;
  column_name: string;
};

/** Mirrors the information_schema filter inside DROP_DEPLOYMENTS_LEGACY_FKS_SQL. */
export function selectDeploymentsChatVersionFkConstraints(
  rows: DeploymentsFkCatalogRow[],
): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.table_schema !== "public") continue;
    if (row.table_name !== "deployments") continue;
    if (row.constraint_type !== "FOREIGN KEY") continue;
    if (
      !(DEPLOYMENTS_FK_DROP_COLUMNS as readonly string[]).includes(row.column_name)
    ) {
      continue;
    }
    names.add(row.constraint_name);
  }
  return [...names].sort();
}

export const DROP_DEPLOYMENTS_LEGACY_FKS_SQL = `DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'deployments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('chat_id', 'version_id')
  LOOP
    EXECUTE format('ALTER TABLE deployments DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
  END LOOP;
END $$;`;
