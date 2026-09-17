// @vitest-environment node
/**
 * Migration contract for the kostnadsfri campaign against real Postgres.
 *
 * The migration is applied to a transaction-local schema containing the
 * pre-campaign generation_billings shape. A legacy row is inserted before the
 * migration and another old-writer row (which omits every campaign column) is
 * inserted afterwards. The same isolated schema also proves the database-owned
 * entitlement, phase, and generation-slot invariants.
 *
 * Safety: the test refuses every target except dev through the repository's
 * check-db-env-target helper. The schema and every row live inside one
 * transaction which afterAll rolls back, so the shared public schema is never
 * modified.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config as loadEnvFile } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveDevDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };

  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  return verdict.ok
    ? { url: resolved.value, reason: verdict.message }
    : { url: null, reason: verdict.message };
}

const target = resolveDevDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[kostnadsfri-campaign.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kampanjkontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const migrationPath = join(
  process.cwd(),
  "src",
  "lib",
  "db",
  "migrations",
  "add-kostnadsfri-campaign-entitlements.sql",
);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

describe.skipIf(!target.url)("kostnadsfri campaign-migration mot riktig Postgres", () => {
  const runTag = randomUUID().replaceAll("-", "").slice(0, 16);
  const schema = `kostnadsfri_contract_${runTag}`;
  const quotedSchema = quoteIdentifier(schema);
  const oldBillingId = `billing_old_${runTag}`;
  let client: Client;
  let migrationSql: string;
  let savepointSequence = 0;

  async function insertLegacyBilling(id: string): Promise<void> {
    await client.query(
      `INSERT INTO generation_billings (
         id, version_id, chat_id, user_id, status,
         markup_basis_points, usd_to_sek_ore, sek_per_credit_ore, pricing_version
       ) VALUES ($1, $2, $3, $4, 'pending', 20000, 1050, 300, 'contract-v1')`,
      [id, `version_${id}`, `chat_${id}`, `user_${runTag}`],
    );
  }

  async function insertEntitlement(input: {
    id: string;
    invitationSlug: string;
    projectId: string;
  }): Promise<void> {
    await client.query(
      `INSERT INTO kostnadsfri_campaign_entitlements (
         id, invitation_slug, project_id, session_id
       ) VALUES ($1, $2, $3, $4)`,
      [input.id, input.invitationSlug, input.projectId, `session_${input.id}`],
    );
  }

  async function insertCampaignBilling(input: {
    id: string;
    entitlementId: string | null;
    phase: string | null;
  }): Promise<void> {
    await client.query(
      `INSERT INTO generation_billings (
         id, version_id, chat_id, user_id, status,
         markup_basis_points, usd_to_sek_ore, sek_per_credit_ore, pricing_version,
         campaign_entitlement_id, campaign_phase
       ) VALUES ($1, $2, $3, $4, 'pending', 20000, 1050, 300, 'contract-v1', $5, $6)`,
      [
        input.id,
        `version_${input.id}`,
        `chat_${input.id}`,
        `user_${runTag}`,
        input.entitlementId,
        input.phase,
      ],
    );
  }

  async function expectPgRejection(
    operation: () => Promise<void>,
    expected: { code: string; constraint: string },
  ): Promise<void> {
    const savepoint = `expected_error_${(savepointSequence += 1)}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    let failure: unknown;
    try {
      await operation();
    } catch (error) {
      failure = error;
    } finally {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    }
    expect(failure).toMatchObject(expected);
  }

  beforeAll(async () => {
    client = new Client({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
    });
    await client.connect();
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${quotedSchema}`);
    await client.query(`SET LOCAL search_path = ${quotedSchema}, pg_catalog`);

    // The exact pre-campaign billing shape used by the existing writer. It has
    // no campaign columns yet, and deliberately has no foreign keys.
    await client.query(`
      CREATE TABLE generation_billings (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        user_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        provider_cost_microusd INTEGER NOT NULL DEFAULT 0,
        provider_cost_ore INTEGER NOT NULL DEFAULT 0,
        markup_basis_points INTEGER NOT NULL,
        billable_ore INTEGER NOT NULL DEFAULT 0,
        usd_to_sek_ore INTEGER NOT NULL,
        sek_per_credit_ore INTEGER NOT NULL,
        credits_charged INTEGER NOT NULL DEFAULT 0,
        free_generation_eligible BOOLEAN NOT NULL DEFAULT TRUE,
        free_generation_applied BOOLEAN NOT NULL DEFAULT FALSE,
        claim_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
        usage_started_at TIMESTAMPTZ,
        llm_calls INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        pricing_version TEXT NOT NULL,
        price_breakdown JSONB,
        transaction_ids JSONB,
        first_usage_at TIMESTAMPTZ,
        last_usage_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX generation_billings_version_unique
        ON generation_billings(version_id);

      -- Exact first-apply #1362 shape: the table already exists and these two
      -- invariants are standalone indexes rather than pg_constraint rows.
      CREATE TABLE kostnadsfri_campaign_entitlements (
        id TEXT PRIMARY KEY,
        invitation_slug TEXT NOT NULL,
        kostnadsfri_page_id INTEGER,
        project_id TEXT NOT NULL,
        user_id TEXT,
        session_id TEXT NOT NULL,
        initial_chat_id TEXT,
        initial_version_id TEXT,
        initial_claimed_at TIMESTAMPTZ,
        followup_version_id TEXT,
        followup_claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX kostnadsfri_campaign_invitation_unique
        ON kostnadsfri_campaign_entitlements(invitation_slug);
      CREATE UNIQUE INDEX kostnadsfri_campaign_project_unique
        ON kostnadsfri_campaign_entitlements(project_id);
    `);

    await insertLegacyBilling(oldBillingId);
    const sourceMigrationSql = await readFile(migrationPath, "utf8");
    // The production migration is deliberately public-qualified so search_path
    // cannot redirect its catalog proof. This contract must stay transaction-
    // local, so both the first application and the reapplication use the exact
    // SQL with only that schema qualifier replaced by the isolated test schema.
    migrationSql = sourceMigrationSql.replaceAll("public.", `${quotedSchema}.`);
    await client.query(migrationSql);
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => null);
    await client.end().catch(() => null);
  }, 60_000);

  it("preserves old rows and accepts legacy writes which omit all campaign columns", async () => {
    const newBillingId = `billing_new_legacy_${runTag}`;
    await insertLegacyBilling(newBillingId);

    const rows = await client.query<{
      id: string;
      campaign_entitlement_id: string | null;
      campaign_phase: string | null;
      campaign_free_applied: boolean;
    }>(
      `SELECT id, campaign_entitlement_id, campaign_phase, campaign_free_applied
       FROM generation_billings
       WHERE id = ANY($1::text[])
       ORDER BY id`,
      [[oldBillingId, newBillingId]],
    );

    expect(rows.rows).toEqual([
      {
        id: newBillingId,
        campaign_entitlement_id: null,
        campaign_phase: null,
        campaign_free_applied: false,
      },
      {
        id: oldBillingId,
        campaign_entitlement_id: null,
        campaign_phase: null,
        campaign_free_applied: false,
      },
    ]);
  });

  it("rejects duplicate invitation and project entitlements in the database", async () => {
    const entitlementId = `ent_unique_${runTag}`;
    const invitationSlug = `invite_unique_${runTag}`;
    const projectId = `project_unique_${runTag}`;
    await insertEntitlement({ id: entitlementId, invitationSlug, projectId });

    await expectPgRejection(
      () =>
        insertEntitlement({
          id: `ent_duplicate_invite_${runTag}`,
          invitationSlug,
          projectId: `project_other_${runTag}`,
        }),
      { code: UNIQUE_VIOLATION, constraint: "kostnadsfri_campaign_invitation_unique" },
    );
    await expectPgRejection(
      () =>
        insertEntitlement({
          id: `ent_duplicate_project_${runTag}`,
          invitationSlug: `invite_other_${runTag}`,
          projectId,
        }),
      { code: UNIQUE_VIOLATION, constraint: "kostnadsfri_campaign_project_unique" },
    );
  });

  it("allows one initial and one followup slot and rejects duplicate or invalid phases", async () => {
    const entitlementId = `ent_slot_${runTag}`;
    await insertEntitlement({
      id: entitlementId,
      invitationSlug: `invite_slot_${runTag}`,
      projectId: `project_slot_${runTag}`,
    });
    await insertCampaignBilling({
      id: `billing_initial_${runTag}`,
      entitlementId,
      phase: "initial",
    });
    await insertCampaignBilling({
      id: `billing_followup_${runTag}`,
      entitlementId,
      phase: "followup",
    });

    await expectPgRejection(
      () =>
        insertCampaignBilling({
          id: `billing_duplicate_initial_${runTag}`,
          entitlementId,
          phase: "initial",
        }),
      { code: UNIQUE_VIOLATION, constraint: "generation_billings_campaign_slot_unique" },
    );
    await expectPgRejection(
      () =>
        insertCampaignBilling({
          id: `billing_duplicate_followup_${runTag}`,
          entitlementId,
          phase: "followup",
        }),
      { code: UNIQUE_VIOLATION, constraint: "generation_billings_campaign_slot_unique" },
    );
    await expectPgRejection(
      () =>
        insertCampaignBilling({
          id: `billing_invalid_phase_${runTag}`,
          entitlementId,
          phase: "bonus",
        }),
      { code: CHECK_VIOLATION, constraint: "generation_billings_campaign_phase_check" },
    );
    await expectPgRejection(
      () =>
        insertCampaignBilling({
          id: `billing_phase_without_entitlement_${runTag}`,
          entitlementId: null,
          phase: "initial",
        }),
      { code: CHECK_VIOLATION, constraint: "generation_billings_campaign_phase_check" },
    );
    await expectPgRejection(
      () =>
        insertCampaignBilling({
          id: `billing_entitlement_without_phase_${runTag}`,
          entitlementId,
          phase: null,
        }),
      { code: CHECK_VIOLATION, constraint: "generation_billings_campaign_phase_check" },
    );
  });

  it("reapplies the real migration without duplicating its constraints or indexes", async () => {
    // Simulate the first dev apply, whose CHECK lacked an explicit phase
    // non-null arm and therefore accepted entitlement + NULL phase as UNKNOWN.
    await client.query(`
      ALTER TABLE generation_billings
        DROP CONSTRAINT generation_billings_campaign_phase_check;
      ALTER TABLE generation_billings
        ADD CONSTRAINT generation_billings_campaign_phase_check
        CHECK (
          (campaign_entitlement_id IS NULL AND campaign_phase IS NULL)
          OR
          (campaign_entitlement_id IS NOT NULL AND campaign_phase IN ('initial', 'followup'))
        );
    `);
    await client.query(migrationSql);

    const check = await client.query<{ count: string; definition: string }>(
      `SELECT COUNT(*)::text AS count,
              MAX(pg_get_constraintdef(oid)) AS definition
       FROM pg_constraint
       WHERE conrelid = 'generation_billings'::regclass
         AND conname = 'generation_billings_campaign_phase_check'`,
    );
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = $1
         AND indexname = ANY($2::text[])
       ORDER BY indexname`,
      [
        schema,
        [
          "generation_billings_campaign_slot_unique",
          "kostnadsfri_campaign_invitation_unique",
          "kostnadsfri_campaign_project_unique",
        ],
      ],
    );
    const entitlementConstraints = await client.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = 'kostnadsfri_campaign_entitlements'::regclass
         AND conname = ANY($1::text[])
       ORDER BY conname`,
      [["kostnadsfri_campaign_invitation_unique", "kostnadsfri_campaign_project_unique"]],
    );

    expect(check.rows).toHaveLength(1);
    expect(check.rows[0].count).toBe("1");
    expect(check.rows[0].definition).toContain("campaign_phase IS NOT NULL");
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "generation_billings_campaign_slot_unique",
      "kostnadsfri_campaign_invitation_unique",
      "kostnadsfri_campaign_project_unique",
    ]);
    expect(entitlementConstraints.rows.map((row) => row.conname)).toEqual([
      "kostnadsfri_campaign_invitation_unique",
      "kostnadsfri_campaign_project_unique",
    ]);
  });
});
