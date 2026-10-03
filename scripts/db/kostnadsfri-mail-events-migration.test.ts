import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATION_ORDER } from "./migration-order.mjs";

const filename = "add-kostnadsfri-mail-events.sql";
const sql = readFileSync(join(process.cwd(), "src", "lib", "db", "migrations", filename), "utf8");

describe("kostnadsfri mail events migration", () => {
  it("is registered after the legacy company send columns", () => {
    expect(MIGRATION_ORDER.indexOf(filename)).toBeGreaterThan(
      MIGRATION_ORDER.indexOf("add-kostnadsfri-sent.sql"),
    );
  });

  it("creates an idempotent per-message table and only a nullable legacy-table addition", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.kostnadsfri_mail_events/i);
    expect(sql).toMatch(/message_id TEXT PRIMARY KEY/i);
    expect(sql).toMatch(/CHECK \(step IN \('first', 'follow'\)\)/i);
    expect(sql).toMatch(/CHECK \(variant IN \('text', 'animated'\)\)/i);
    expect(sql).toMatch(/smtp_accepted_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/delivered_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/replied_at TIMESTAMPTZ/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS mail_message_id TEXT/i);
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it("keeps the event history backend-only", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.kostnadsfri_mail_events FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.kostnadsfri_mail_events FROM authenticated/i);
  });
});
