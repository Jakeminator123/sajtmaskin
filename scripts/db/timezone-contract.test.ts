import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { MIGRATION_ORDER } from "./migration-order.mjs";

/**
 * Kontraktstest för UTC-timezone-hanteringen (M#pg1).
 *
 * Ansvaret flyttades från en racande per-connection `SET TIME ZONE` i
 * `pool.on("connect")` (pg "client.query() when already executing"-varningen,
 * hårt fel i pg@9; opålitlig bakom Supavisor transaction pooling) till en
 * durabel roll-GUC via migrationen `set-role-timezone-utc.sql`.
 *
 * Testet låser BÅDA halvorna av överlämningen: migrationen får inte tappas
 * ur manifestet eller ändra roll-target, och den racande connect-queryn får
 * inte återinföras i client.ts. Statiskt (ingen DB) — riktiga sessionens
 * timezone verifieras post-deploy (SHOW timezone = UTC via poolern).
 */

const REPO_ROOT = join(__dirname, "..", "..");
const MIGRATION_FILE = "set-role-timezone-utc.sql";

describe("timezone contract (M#pg1)", () => {
  it("the role-level UTC migration is present in MIGRATION_ORDER", () => {
    expect(MIGRATION_ORDER).toContain(MIGRATION_FILE);
  });

  it("the migration sets timezone UTC on CURRENT_USER (no hardcoded role)", () => {
    const sql = readFileSync(
      join(REPO_ROOT, "src", "lib", "db", "migrations", MIGRATION_FILE),
      "utf8",
    );
    expect(sql).toMatch(/ALTER\s+ROLE\s+CURRENT_USER\s+SET\s+timezone\s+TO\s+'UTC'/i);
  });

  it("client.ts does not reintroduce a racing per-connection SET TIME ZONE", () => {
    const clientSource = readFileSync(
      join(REPO_ROOT, "src", "lib", "db", "client.ts"),
      "utf8",
    );
    // Ingen query får köras i en connect-handler: pool.on("connect") med en
    // client.query(...) är exakt race-mönstret som gav pg-varningen.
    const connectHandler = clientSource.match(
      /pool\.on\(\s*["']connect["'][\s\S]*?\n\s*\}\)/,
    );
    if (connectHandler) {
      expect(connectHandler[0]).not.toMatch(/\.query\(/);
    }
    expect(clientSource).not.toMatch(/query\(\s*["'`]SET\s+TIME\s+ZONE/i);
  });
});
