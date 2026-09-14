import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATION_ORDER } from "./migration-order.mjs";

const REPO_ROOT = process.cwd();
const migration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/add-generation-billing.sql"),
  "utf8",
);
const claimKeysMigration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/add-generation-billing-claim-keys.sql"),
  "utf8",
);
const freeEligibilityMigration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/add-generation-billing-free-eligibility.sql"),
  "utf8",
);
const usageStartMigration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/add-generation-billing-usage-start.sql"),
  "utf8",
);
const campaignMigration = readFileSync(
  join(REPO_ROOT, "src/lib/db/migrations/add-kostnadsfri-campaign-entitlements.sql"),
  "utf8",
);
const dbHealth = readFileSync(join(REPO_ROOT, "scripts/db/db-health-check.mjs"), "utf8");
const dbInit = readFileSync(join(REPO_ROOT, "scripts/db/db-init.mjs"), "utf8");
const drizzleSchema = readFileSync(join(REPO_ROOT, "src/lib/db/schema.ts"), "utf8");

function firstGenerationCte(sql: string): string {
  const match = sql.match(/WITH first_generation AS \(([\s\S]*?)\)\s*UPDATE users AS u/i);
  if (!match?.[1]) {
    throw new Error("add-generation-billing.sql saknar first_generation-CTE");
  }
  return match[1].replace(/\s+/g, " ").trim();
}

describe("add-generation-billing free-generation backfill", () => {
  const cte = firstGenerationCte(migration);

  it("uses the durable generated-version lifecycle signal, not best-effort usage telemetry", () => {
    expect(cte).toContain("JOIN engine_messages em");
    expect(cte).toMatch(/em\.id = ev\.message_id/i);
    expect(cte).toMatch(/em\.chat_id = ev\.chat_id/i);
    expect(cte).toMatch(/em\.role = 'assistant'/i);
    expect(cte).toMatch(/ev\.edit_kind IS NULL/i);
    expect(cte).not.toMatch(/\bllm_usage\b/i);
  });

  it("keeps the earliest generated version as the historical claim", () => {
    expect(cte).toMatch(/SELECT DISTINCT ON \(ap\.user_id\)/i);
    expect(cte).toMatch(/ORDER BY ap\.user_id, ev\.created_at ASC, ev\.id ASC/i);
  });
});

describe("generation billing claim-key migration", () => {
  it("creates the durable claim-key list for both fresh and already-migrated databases", () => {
    expect(migration).toMatch(/claim_keys JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
    expect(claimKeysMigration).toMatch(
      /ALTER TABLE generation_billings[\s\S]*ADD COLUMN IF NOT EXISTS claim_keys JSONB NOT NULL DEFAULT '\[\]'::jsonb/i,
    );
  });

  it("runs the follow-up immediately after the base billing migration", () => {
    const baseIndex = MIGRATION_ORDER.indexOf("add-generation-billing.sql");
    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(MIGRATION_ORDER[baseIndex + 1]).toBe("add-generation-billing-claim-keys.sql");
    expect(MIGRATION_ORDER[baseIndex + 2]).toBe("add-generation-billing-free-eligibility.sql");
    expect(MIGRATION_ORDER[baseIndex + 3]).toBe("add-generation-billing-usage-start.sql");
    expect(MIGRATION_ORDER[baseIndex + 4]).toBe("add-kostnadsfri-campaign-entitlements.sql");
  });

  it("keeps the recovery column in the read-only database health contract", () => {
    expect(dbHealth).toMatch(
      /generation_billings:\s*\[[\s\S]*"claim_keys",[\s\S]*"campaign_entitlement_id",[\s\S]*"campaign_phase",[\s\S]*"campaign_free_applied"/,
    );
    expect(dbHealth).toContain("allMissingColumns.length === 0");
  });
});

describe("kostnadsfri campaign billing migration", () => {
  it("reserves each invitation phase once and keeps the server-owned table private", () => {
    expect(campaignMigration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS generation_billings_campaign_slot_unique[\s\S]*campaign_entitlement_id, campaign_phase/i,
    );
    expect(campaignMigration).toMatch(
      /ALTER TABLE (?:public\.)?kostnadsfri_campaign_entitlements ENABLE ROW LEVEL SECURITY/i,
    );
    expect(campaignMigration).toMatch(
      /REVOKE ALL ON TABLE (?:public\.)?kostnadsfri_campaign_entitlements FROM authenticated/i,
    );
    expect(campaignMigration).toMatch(
      /campaign_entitlement_id IS NOT NULL[\s\S]*campaign_phase IS NOT NULL[\s\S]*campaign_phase IN \('initial', 'followup'\)/i,
    );
    expect(campaignMigration).toMatch(
      /pg_get_constraintdef\(oid\) NOT ILIKE '%campaign_phase IS NOT NULL%'[\s\S]*DROP CONSTRAINT generation_billings_campaign_phase_check/i,
    );
  });

  it("declares invitation and project uniqueness inline in every schema owner", () => {
    for (const name of [
      "kostnadsfri_campaign_invitation_unique",
      "kostnadsfri_campaign_project_unique",
    ]) {
      expect(campaignMigration).toMatch(new RegExp(`CONSTRAINT ${name} UNIQUE`, "i"));
      expect(campaignMigration).toMatch(new RegExp(`ADD\\s+CONSTRAINT ${name} UNIQUE`, "i"));
      expect(campaignMigration).toMatch(
        new RegExp(`ADD\\s+CONSTRAINT ${name}\\s+UNIQUE USING INDEX ${name}`, "i"),
      );
      expect(dbInit).toMatch(new RegExp(`CONSTRAINT ${name} UNIQUE`, "i"));
      expect(drizzleSchema).toContain(`unique("${name}")`);
    }
    expect(campaignMigration).not.toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS kostnadsfri_campaign_(?:invitation|project)_unique/i,
    );
    expect(dbInit).not.toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS kostnadsfri_campaign_(?:invitation|project)_unique/i,
    );
  });

  it("declares the partial unique slot index in both schema owners", () => {
    expect(drizzleSchema).toMatch(
      /uniqueIndex\("generation_billings_campaign_slot_unique"\)[\s\S]*\.on\(table\.campaign_entitlement_id, table\.campaign_phase\)[\s\S]*\.where\(sql`\$\{table\.campaign_entitlement_id\} is not null`\)/,
    );
    expect(dbHealth).toMatch(
      /name: "generation_billings_campaign_slot_unique",[\s\S]*columns: \["campaign_entitlement_id", "campaign_phase"\],[\s\S]*unique: true,[\s\S]*partial: true/,
    );
  });
});

describe("generation billing usage boundary", () => {
  it("creates the nullable boundary for fresh and already-migrated databases", () => {
    expect(migration).toMatch(/usage_started_at TIMESTAMPTZ/i);
    expect(usageStartMigration).toMatch(
      /ALTER TABLE generation_billings[\s\S]*ADD COLUMN IF NOT EXISTS usage_started_at TIMESTAMPTZ/i,
    );
  });
});

describe("generation billing free-eligibility policy", () => {
  it("creates the explicit policy column for fresh and already-migrated databases", () => {
    expect(migration).toMatch(/free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE/i);
    expect(freeEligibilityMigration).toMatch(
      /ALTER TABLE generation_billings[\s\S]*ADD COLUMN IF NOT EXISTS free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE/i,
    );
  });
});
