import { describe, expect, it } from "vitest";
import { MIGRATION_ORDER } from "./migration-order.mjs";
import { diffPendingMigrations } from "./migration-ledger.mjs";

// Guards the pure diff that powers `db:migrate:check` (the prod migration-ledger
// gate). The DB-touching parts (ensure/record/read) are exercised for real by
// `db:migrate` / `db:migrate:prod` against a live Postgres; here we lock the
// behind/ahead logic that decides whether CI reddens.
describe("diffPendingMigrations", () => {
  it("treats a null ledger (table not created yet) as ALL migrations pending", () => {
    expect(diffPendingMigrations(null)).toEqual([...MIGRATION_ORDER]);
  });

  it("reports no pending when every migration is recorded", () => {
    const applied = new Set(MIGRATION_ORDER);
    expect(diffPendingMigrations(applied)).toEqual([]);
  });

  it("reports exactly the unrecorded migrations, in MIGRATION_ORDER order", () => {
    // Drop the first and last recorded => both should surface as pending.
    const applied = new Set(MIGRATION_ORDER.slice(1, MIGRATION_ORDER.length - 1));
    const pending = diffPendingMigrations(applied);
    expect(pending).toEqual([
      MIGRATION_ORDER[0],
      MIGRATION_ORDER[MIGRATION_ORDER.length - 1],
    ]);
  });

  it("ignores unknown/extra ledger entries (only MIGRATION_ORDER matters)", () => {
    const applied = new Set([...MIGRATION_ORDER, "some-old-removed-migration.sql"]);
    expect(diffPendingMigrations(applied)).toEqual([]);
  });
});
