/**
 * Regression guard for the P0 publish bug (2026-07-08): deployments.chat_id /
 * deployments.version_id must NOT have foreign keys to the legacy
 * `chats`/`versions` tables. The own-engine publish flow writes ENGINE ids
 * (engine_chats/engine_versions) into those columns, so a legacy FK makes
 * every publish fail with a foreign-key violation on the insert.
 *
 * The columns hold ids from EITHER world (legacy v0-era or engine), so no
 * FK target is valid. This test locks all three sources that could
 * re-introduce the constraint: db-init CREATE TABLE, db-init cascadeQueries
 * and the migration manifest.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

describe("deployments legacy-FK guard", () => {
  it("db-init CREATE TABLE has no FK on chat_id/version_id", () => {
    const body = deploymentsCreateTable(DB_INIT);
    expect(body).not.toMatch(/chat_id[^,]*REFERENCES/i);
    expect(body).not.toMatch(/version_id[^,]*REFERENCES/i);
    // project_id's legacy FK is intentionally kept (legacy projects table).
    expect(body).toMatch(/project_id[^,]*REFERENCES\s+projects/i);
  });

  it("db-init cascadeQueries never re-adds the dropped constraints", () => {
    expect(DB_INIT).not.toMatch(/ADD CONSTRAINT deployments_chat_id_fkey/);
    expect(DB_INIT).not.toMatch(/ADD CONSTRAINT deployments_version_id_fkey/);
    // The DROPs must stay so old environments get cleaned on db:init too.
    expect(DB_INIT).toMatch(/DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey/);
    expect(DB_INIT).toMatch(/DROP CONSTRAINT IF EXISTS deployments_version_id_fkey/);
  });

  it("the drop migration exists and is registered in MIGRATION_ORDER", () => {
    expect(DROP_MIGRATION).toMatch(/DROP CONSTRAINT IF EXISTS deployments_chat_id_fkey/);
    expect(DROP_MIGRATION).toMatch(/DROP CONSTRAINT IF EXISTS deployments_version_id_fkey/);
    expect(MIGRATION_ORDER_SRC).toContain('"drop-deployments-legacy-fks.sql"');
  });
});
