/**
 * Regression guard for the P0 publish bug (2026-07-08): deployments.chat_id /
 * deployments.version_id must NOT have foreign keys to the legacy
 * `chats`/`versions` tables. The own-engine publish flow writes ENGINE ids
 * (engine_chats/engine_versions) into those columns, so a legacy FK makes
 * every publish fail with a foreign-key violation on the insert.
 *
 * The columns hold ids from EITHER world (legacy v0-era or engine), so no
 * FK target is valid. This test locks db-init CREATE TABLE, db-init
 * cascadeQueries and the migration manifest, and verifies the catalog-based
 * drop logic covers every constraint naming variant.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENTS_FK_DROP_COLUMNS,
  DROP_DEPLOYMENTS_LEGACY_FKS_SQL,
  selectDeploymentsChatVersionFkConstraints,
  type DeploymentsFkCatalogRow,
} from "./deployments-legacy-fk-drop";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DB_INIT = readFileSync(join(REPO_ROOT, "scripts/db/db-init.mjs"), "utf8");
const DROP_MIGRATION = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/drop-deployments-legacy-fks.sql"),
  "utf8",
);
const MIGRATION_ORDER_SRC = readFileSync(
  join(REPO_ROOT, "scripts/db/migration-order.mjs"),
  "utf8",
);

function deploymentsCreateTable(source: string): string {
  const match = source.match(/CREATE TABLE IF NOT EXISTS deployments \(([\s\S]*?)\)`/);
  expect(match, "deployments CREATE TABLE not found in db-init.mjs").not.toBeNull();
  return match![1];
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function catalogRow(
  partial: Pick<DeploymentsFkCatalogRow, "constraint_name" | "column_name"> &
    Partial<DeploymentsFkCatalogRow>,
): DeploymentsFkCatalogRow {
  return {
    table_schema: "public",
    table_name: "deployments",
    constraint_type: "FOREIGN KEY",
    ...partial,
  };
}

describe("deployments legacy-FK guard", () => {
  it("db-init CREATE TABLE has no FK on chat_id/version_id", () => {
    const body = deploymentsCreateTable(DB_INIT);
    expect(body).not.toMatch(/chat_id[^,]*REFERENCES/i);
    expect(body).not.toMatch(/version_id[^,]*REFERENCES/i);
    // project_id's legacy FK is intentionally kept (legacy projects table).
    expect(body).toMatch(/project_id[^,]*REFERENCES\s+projects/i);
  });

  it("db-init cascadeQueries never re-adds chat_id/version_id constraints", () => {
    expect(DB_INIT).not.toMatch(/ADD CONSTRAINT deployments_chat_id/i);
    expect(DB_INIT).not.toMatch(/ADD CONSTRAINT deployments_version_id/i);
    expect(DB_INIT).toContain("information_schema.table_constraints");
    expect(DB_INIT).toMatch(/kcu\.column_name IN \('chat_id', 'version_id'\)/);
    expect(DB_INIT).not.toMatch(
      /DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey/,
    );
  });

  it("the drop migration is registered and matches the shared catalog-drop SQL", () => {
    expect(MIGRATION_ORDER_SRC).toContain('"drop-deployments-legacy-fks.sql"');
    expect(normalizeSql(DROP_MIGRATION)).toContain(
      normalizeSql(DROP_DEPLOYMENTS_LEGACY_FKS_SQL),
    );
    expect(DROP_MIGRATION).toMatch(/information_schema\.table_constraints/);
    expect(DROP_MIGRATION).not.toMatch(
      /DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey/,
    );
  });

  it("catalog selection drops Postgres-default and Drizzle-named FK constraints", () => {
    const rows: DeploymentsFkCatalogRow[] = [
      catalogRow({
        constraint_name: "deployments_chat_id_fkey",
        column_name: "chat_id",
      }),
      catalogRow({
        constraint_name: "deployments_version_id_fkey",
        column_name: "version_id",
      }),
      catalogRow({
        constraint_name: "deployments_chat_id_chats_id_fk",
        column_name: "chat_id",
      }),
      catalogRow({
        constraint_name: "deployments_version_id_versions_id_fk",
        column_name: "version_id",
      }),
      catalogRow({
        constraint_name: "deployments_project_id_fkey",
        column_name: "project_id",
      }),
      catalogRow({
        constraint_name: "deployments_chat_id_fkey",
        column_name: "chat_id",
        table_schema: "other",
      }),
    ];

    expect(selectDeploymentsChatVersionFkConstraints(rows)).toEqual([
      "deployments_chat_id_chats_id_fk",
      "deployments_chat_id_fkey",
      "deployments_version_id_fkey",
      "deployments_version_id_versions_id_fk",
    ]);
    expect(DEPLOYMENTS_FK_DROP_COLUMNS).toEqual(["chat_id", "version_id"]);
  });
});
