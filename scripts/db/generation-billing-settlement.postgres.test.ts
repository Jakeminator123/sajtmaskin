// @vitest-environment node
/**
 * Postgres-backat kontraktstest för den ekonomiska generationssettlementen.
 *
 * De rena enhetstesterna kan bevisa hur kostnaden räknas, men inte att
 * användarrättigheten, saldot, transaktionsloggen och den unika billing-raden
 * ändras atomiskt och idempotent i riktig Postgres. Det här testet kör därför
 * den faktiska `settleGenerationBilling`-funktionen mot två färdigställda
 * versioner: exakt en blir gratis, nästa debiteras enligt den aktiva
 * settings-raden och återkörningar får inte skapa en andra debitering.
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target via repots
 * `check-db-env-target.mjs`. Alla id:n har ett unikt körprefix. Billing- och
 * usage-tabellerna saknar medvetet FK/cascade, så `afterAll` raderar dem
 * explicit innan resten av testgrafen tas bort.
 *
 * Migrationens historiska backfill körs inte om här: den uppdaterar riktiga
 * befintliga användare och är därför olämplig mot en delad dev-databas. Testet
 * verifierar i stället kolumnerna/defaulten/indexet som settlementen kräver.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculateCustomerCharge, calculateModelCost } from "../../src/lib/billing/model-cost";
import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

// Vitest laddar inte `.env.local`. En explicit CI-URL ska alltid vinna.
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
    `[generation-billing.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att settlement-kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("generationsdebitering mot riktig Postgres", () => {
  const runTag = randomUUID();
  const userId = `usr_gbtest_${runTag}`;
  const projectId = `prj_gbtest_${runTag}`;
  const chatId = `chat_gbtest_${runTag}`;
  const firstMessageId = `msg_gbtest_1_${runTag}`;
  const secondMessageId = `msg_gbtest_2_${runTag}`;
  const firstVersionId = `ver_gbtest_1_${runTag}`;
  const secondVersionId = `ver_gbtest_2_${runTag}`;
  const firstUsageId = `usage_gbtest_1_${runTag}`;
  const secondUsageId = `usage_gbtest_2_${runTag}`;
  const lateUsageId = `usage_gbtest_late_${runTag}`;
  const historicalUserId = `usr_gbtest_historical_${runTag}`;
  const historicalProjectId = `prj_gbtest_historical_${runTag}`;
  const historicalChatId = `chat_gbtest_historical_${runTag}`;
  const historicalMessageId = `msg_gbtest_historical_${runTag}`;
  const historicalVersionId = `ver_gbtest_historical_${runTag}`;
  const historicalOldUsageId = `usage_gbtest_historical_old_${runTag}`;
  const historicalNewUsageId = `usage_gbtest_historical_new_${runTag}`;
  const initialBalance = 1_000_000;
  const frozenCostMicroUsd = 1_000_000;
  const model = "gpt-5.6-luna";
  const inputTokens = 1_000;
  const outputTokens = 100;

  let pool: Pool;
  let billing: typeof import("../../src/lib/db/services/generation-billing");

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 3,
    });

    await pool.query(
      `insert into users (
         id, email, name, provider, diamonds, free_generation_available, email_verified
       ) values ($1, $2, $3, 'email', $4, true, true)`,
      [userId, `generation-billing-${runTag}@example.invalid`, "Billing contract", initialBalance],
    );
    await pool.query(
      `insert into users (
         id, email, name, provider, diamonds, free_generation_available, email_verified
       ) values ($1, $2, $3, 'email', $4, true, true)`,
      [
        historicalUserId,
        `generation-billing-historical-${runTag}@example.invalid`,
        "Historical billing contract",
        initialBalance,
      ],
    );
    await pool.query("insert into app_projects (id, user_id, name) values ($1, $2, $3)", [
      projectId,
      userId,
      "generation billing postgres-test",
    ]);
    await pool.query(
      "insert into engine_chats (id, project_id, title, model) values ($1, $2, $3, $4)",
      [chatId, projectId, "generation billing postgres-test", model],
    );
    await pool.query("insert into app_projects (id, user_id, name) values ($1, $2, $3)", [
      historicalProjectId,
      historicalUserId,
      "historical generation billing postgres-test",
    ]);
    await pool.query(
      "insert into engine_chats (id, project_id, title, model) values ($1, $2, $3, $4)",
      [
        historicalChatId,
        historicalProjectId,
        "historical generation billing postgres-test",
        model,
      ],
    );
    await pool.query(
      `insert into engine_messages (id, chat_id, role, content)
       values ($1, $3, 'assistant', 'first'), ($2, $3, 'assistant', 'second')`,
      [firstMessageId, secondMessageId, chatId],
    );
    await pool.query(
      `insert into engine_versions (
         id, chat_id, message_id, version_number, files_json, edit_kind
       ) values
         ($1, $3, $4, 1, $6, null),
         ($2, $3, $5, 2, $6, null)`,
      [
        firstVersionId,
        secondVersionId,
        chatId,
        firstMessageId,
        secondMessageId,
        JSON.stringify({ "app/page.tsx": "export default function Page() { return null; }" }),
      ],
    );
    await pool.query(
      `insert into engine_messages (id, chat_id, role, content)
       values ($1, $2, 'assistant', 'historical')`,
      [historicalMessageId, historicalChatId],
    );
    await pool.query(
      `insert into engine_versions (
         id, chat_id, message_id, version_number, files_json, edit_kind
       ) values ($1, $2, $3, 1, $4, null)`,
      [
        historicalVersionId,
        historicalChatId,
        historicalMessageId,
        JSON.stringify({ "app/page.tsx": "export default function Historical() { return null; }" }),
      ],
    );

    const costBreakdown = calculateModelCost(model, {
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens,
      reasoningTokens: 0,
    });
    if (!costBreakdown) throw new Error(`Testmodellen ${model} saknar pris`);

    await pool.query(
      `insert into llm_usage (
         id, chat_id, version_id, user_id, phase, provider, model,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, cost_microusd, pricing_version, cost_breakdown, ok
       ) values
         ($1, $3, $4, $5, 'codegen', 'openai', $6, $7, 0, 0, $8, 0, $9, 'gbtest-v1', $10, true),
         ($2, $3, $11, $5, 'codegen', 'openai', $6, $7, 0, 0, $8, 0, $9, 'gbtest-v1', $10, true)`,
      [
        firstUsageId,
        secondUsageId,
        chatId,
        firstVersionId,
        userId,
        model,
        inputTokens,
        outputTokens,
        frozenCostMicroUsd,
        JSON.stringify({ ...costBreakdown, priceVersion: "gbtest-v1" }),
        secondVersionId,
      ],
    );
    await pool.query(
      `insert into llm_usage (
         id, chat_id, version_id, user_id, phase, provider, model,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, cost_microusd, pricing_version, cost_breakdown, ok, created_at
       ) values (
         $1, $2, $3, $4, 'historical-codegen', 'openai', $5,
         $6, 0, 0, $7, 0, $8, 'gbtest-v1', $9, true, NOW() - INTERVAL '1 day'
       )`,
      [
        historicalOldUsageId,
        historicalChatId,
        historicalVersionId,
        historicalUserId,
        model,
        inputTokens,
        outputTokens,
        frozenCostMicroUsd,
        JSON.stringify({ ...costBreakdown, priceVersion: "gbtest-v1" }),
      ],
    );

    // Ladda efter env-grinden och seedningen: db/client läser URL:en vid import.
    billing = await import("../../src/lib/db/services/generation-billing");
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool
      .query("delete from generation_billings where version_id = any($1::text[])", [
        [firstVersionId, secondVersionId, historicalVersionId],
      ])
      .catch(() => null);
    await pool
      .query("delete from llm_usage where id = any($1::text[])", [
        [
          firstUsageId,
          secondUsageId,
          lateUsageId,
          historicalOldUsageId,
          historicalNewUsageId,
        ],
      ])
      .catch(() => null);
    await pool
      .query("delete from transactions where user_id = any($1::text[])", [
        [userId, historicalUserId],
      ])
      .catch(() => null);
    await pool
      .query("delete from engine_chats where id = any($1::text[])", [
        [chatId, historicalChatId],
      ])
      .catch(() => null);
    await pool
      .query("delete from app_projects where id = any($1::text[])", [
        [projectId, historicalProjectId],
      ])
      .catch(() => null);
    await pool
      .query("delete from users where id = any($1::text[])", [[userId, historicalUserId]])
      .catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  it("har migrationens settlement-kolumner, default och versionsunika index", async () => {
    const { rows: columns } = await pool.query<{
      table_name: string;
      column_name: string;
      column_default: string | null;
    }>(
      `select table_name, column_name, column_default
         from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (
            ('users', 'free_generation_available'),
            ('users', 'free_generation_claimed_version_id'),
            ('generation_billings', 'free_generation_eligible'),
            ('generation_billings', 'free_generation_applied'),
            ('generation_billings', 'claim_keys'),
            ('generation_billings', 'usage_started_at'),
            ('llm_usage', 'cost_microusd'),
            ('llm_usage', 'cost_breakdown')
          )`,
    );
    const byKey = new Map(
      columns.map((row) => [`${row.table_name}.${row.column_name}`, row.column_default]),
    );
    expect(byKey.size).toBe(8);
    expect(byKey.get("users.free_generation_available")).toMatch(/true/i);
    expect(byKey.has("users.free_generation_claimed_version_id")).toBe(true);
    expect(byKey.get("generation_billings.free_generation_eligible")).toMatch(/true/i);
    expect(byKey.get("generation_billings.free_generation_applied")).toMatch(/false/i);
    expect(byKey.get("generation_billings.claim_keys")).toMatch(/'\[\]'::jsonb/i);
    expect(byKey.has("generation_billings.usage_started_at")).toBe(true);

    const { rows: indexes } = await pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public'
          and tablename = 'generation_billings'
          and indexname = 'generation_billings_version_unique'`,
    );
    expect(indexes[0]?.indexdef).toContain("UNIQUE");
    expect(indexes[0]?.indexdef).toContain("version_id");
  });

  it("kan inte skapa billingrad eller konsumera entitlement från usage utan finalize-markör", async () => {
    const result = await billing.settleExistingGenerationBillingIfPresent({
      chatId,
      versionId: firstVersionId,
      userId,
    });
    expect(result).toBeNull();

    const { rows: userRows } = await pool.query<{
      diamonds: number;
      free_generation_available: boolean;
      free_generation_claimed_version_id: string | null;
    }>(
      `select diamonds, free_generation_available, free_generation_claimed_version_id
         from users where id = $1`,
      [userId],
    );
    expect(userRows[0]).toEqual({
      diamonds: initialBalance,
      free_generation_available: true,
      free_generation_claimed_version_id: null,
    });

    const { rows: billingRows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from generation_billings where version_id = $1",
      [firstVersionId],
    );
    expect(billingRows[0]?.count).toBe("0");

    const { rows: transactionRows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from transactions where user_id = $1",
      [userId],
    );
    expect(transactionRows[0]?.count).toBe("0");
  }, 60_000);

  it("debiterar markerless historisk repair endast från den durabla usage-gränsen", async () => {
    const settings = await billing.getGenerationBillingSettings();
    const expectedCharge = calculateCustomerCharge({
      providerCostMicroUsd: frozenCostMicroUsd,
      usdToSekOre: settings.usdToSekOre,
      markupBasisPoints: settings.markupBasisPoints,
      sekPerCreditOre: settings.sekPerCreditOre,
    });
    const claimA = `claim-historical-a-${runTag}`;
    const claimB = `claim-historical-b-${runTag}`;

    await billing.establishGenerationBilling({
      chatId: historicalChatId,
      versionId: historicalVersionId,
      userId: historicalUserId,
      claimKey: claimA,
      freeGenerationEligible: false,
      usageStartsAtNow: true,
    });
    const { rows: beforeRetry } = await pool.query<{
      usage_started_at: Date;
      markup_basis_points: number;
      usd_to_sek_ore: number;
      sek_per_credit_ore: number;
    }>(
      `select usage_started_at, markup_basis_points, usd_to_sek_ore, sek_per_credit_ore
         from generation_billings where version_id = $1`,
      [historicalVersionId],
    );
    expect(beforeRetry[0]?.usage_started_at).toBeInstanceOf(Date);

    // A subsequent request may append its claim key through the same
    // idempotent conflict path, but must not move the boundary or re-freeze
    // the active pricing settings.
    await billing.establishGenerationBilling({
      chatId: historicalChatId,
      versionId: historicalVersionId,
      userId: historicalUserId,
      claimKey: claimB,
      freeGenerationEligible: false,
      usageStartsAtNow: true,
    });

    const newBreakdown = calculateModelCost(model, {
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens,
      reasoningTokens: 0,
    });
    if (!newBreakdown) throw new Error(`Testmodellen ${model} saknar pris`);
    await pool.query(
      `insert into llm_usage (
         id, chat_id, version_id, user_id, phase, provider, model,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, cost_microusd, pricing_version, cost_breakdown, ok
       ) values (
         $1, $2, $3, $4, 'manual-repair', 'openai', $5,
         $6, 0, 0, $7, 0, $8, 'gbtest-v1', $9, true
       )`,
      [
        historicalNewUsageId,
        historicalChatId,
        historicalVersionId,
        historicalUserId,
        model,
        inputTokens,
        outputTokens,
        frozenCostMicroUsd,
        JSON.stringify({ ...newBreakdown, priceVersion: "gbtest-v1" }),
      ],
    );

    const settled = await billing.settleGenerationBilling({
      chatId: historicalChatId,
      versionId: historicalVersionId,
      userId: historicalUserId,
    });
    expect(settled).toMatchObject({
      status: "charged",
      creditsCharged: expectedCharge.credits,
      providerCostMicroUsd: frozenCostMicroUsd,
      freeGenerationApplied: false,
    });

    const { rows: billingRows } = await pool.query<{
      usage_started_at: Date;
      markup_basis_points: number;
      usd_to_sek_ore: number;
      sek_per_credit_ore: number;
      provider_cost_microusd: number;
      llm_calls: number;
      claim_keys: string[];
    }>(
      `select usage_started_at, markup_basis_points, usd_to_sek_ore,
              sek_per_credit_ore, provider_cost_microusd, llm_calls, claim_keys
         from generation_billings where version_id = $1`,
      [historicalVersionId],
    );
    expect(billingRows[0]).toMatchObject({
      usage_started_at: beforeRetry[0].usage_started_at,
      markup_basis_points: beforeRetry[0].markup_basis_points,
      usd_to_sek_ore: beforeRetry[0].usd_to_sek_ore,
      sek_per_credit_ore: beforeRetry[0].sek_per_credit_ore,
      provider_cost_microusd: frozenCostMicroUsd,
      llm_calls: 1,
      claim_keys: [claimA, claimB],
    });

    const { rows: userRows } = await pool.query<{
      diamonds: number;
      free_generation_available: boolean;
      free_generation_claimed_version_id: string | null;
    }>(
      `select diamonds, free_generation_available, free_generation_claimed_version_id
         from users where id = $1`,
      [historicalUserId],
    );
    expect(userRows[0]).toEqual({
      diamonds: initialBalance - expectedCharge.credits,
      free_generation_available: true,
      free_generation_claimed_version_id: null,
    });

    const { rows: usageRows } = await pool.query<{
      id: string;
      is_included: boolean;
    }>(
      `select lu.id, lu.created_at >= gb.usage_started_at as is_included
         from llm_usage lu
         join generation_billings gb on gb.version_id = lu.version_id
        where lu.id = any($1::text[])
        order by lu.id`,
      [[historicalOldUsageId, historicalNewUsageId]],
    );
    expect(new Map(usageRows.map((row) => [row.id, row.is_included]))).toEqual(
      new Map([
        [historicalOldUsageId, false],
        [historicalNewUsageId, true],
      ]),
    );
  }, 60_000);

  it("ger exakt en gratis version, debiterar nästa och är idempotent vid återkörning", async () => {
    const settings = await billing.getGenerationBillingSettings();
    const expectedCharge = calculateCustomerCharge({
      providerCostMicroUsd: frozenCostMicroUsd,
      usdToSekOre: settings.usdToSekOre,
      markupBasisPoints: settings.markupBasisPoints,
      sekPerCreditOre: settings.sekPerCreditOre,
    });
    expect(expectedCharge.credits).toBeGreaterThan(0);

    // Båda generationerna har passerat samma entitlement-aware preflight.
    // Settlement-raderna låses separat, så det är användarradens FOR UPDATE
    // som måste serialisera claimen och ge exakt en gratis version.
    await Promise.all(
      [firstVersionId, secondVersionId].map((versionId) =>
        billing.establishGenerationBilling({
          chatId,
          versionId,
          userId,
          claimKey: `claim-${versionId}`,
        }),
      ),
    );
    await billing.establishGenerationBilling({
      chatId,
      versionId: firstVersionId,
      userId,
      claimKey: `claim-extra-${firstVersionId}`,
    });
    const initialSettlements = await Promise.all(
      [firstVersionId, secondVersionId].map(async (versionId) => ({
        versionId,
        result: await billing.settleGenerationBilling({ chatId, versionId, userId }),
      })),
    );
    const freeSettlement = initialSettlements.find(
      (settlement) => settlement.result.status === "free_generation",
    );
    const chargedSettlement = initialSettlements.find(
      (settlement) => settlement.result.status === "charged",
    );
    expect(freeSettlement).toBeDefined();
    expect(chargedSettlement).toBeDefined();
    expect(freeSettlement?.result).toMatchObject({
      creditsCharged: 0,
      creditsAddedThisRun: 0,
      freeGenerationApplied: true,
    });
    expect(chargedSettlement?.result).toMatchObject({
      creditsCharged: expectedCharge.credits,
      creditsAddedThisRun: expectedCharge.credits,
      freeGenerationApplied: false,
    });

    const retries = await Promise.all(
      initialSettlements.map(async ({ versionId }) => ({
        versionId,
        result: await billing.settleGenerationBilling({ chatId, versionId, userId }),
      })),
    );
    expect(
      retries.find((settlement) => settlement.versionId === freeSettlement?.versionId)?.result,
    ).toMatchObject({
      status: "free_generation",
      creditsCharged: 0,
      creditsAddedThisRun: 0,
      creditsRefundedThisRun: 0,
      freeGenerationApplied: true,
    });
    expect(
      retries.find((settlement) => settlement.versionId === chargedSettlement?.versionId)?.result,
    ).toMatchObject({
      status: "charged",
      creditsCharged: expectedCharge.credits,
      creditsAddedThisRun: 0,
      creditsRefundedThisRun: 0,
      freeGenerationApplied: false,
    });

    const { rows: userRows } = await pool.query<{
      diamonds: number;
      free_generation_available: boolean;
      free_generation_claimed_version_id: string | null;
      free_generation_claimed_at: Date | null;
    }>(
      `select diamonds, free_generation_available,
              free_generation_claimed_version_id, free_generation_claimed_at
         from users where id = $1`,
      [userId],
    );
    expect(userRows[0]).toMatchObject({
      diamonds: initialBalance - expectedCharge.credits,
      free_generation_available: false,
      free_generation_claimed_version_id: freeSettlement?.versionId,
    });
    expect(userRows[0]?.free_generation_claimed_at).toBeInstanceOf(Date);

    const { rows: billingRows } = await pool.query<{
      version_id: string;
      status: string;
      provider_cost_microusd: number;
      provider_cost_ore: number;
      billable_ore: number;
      credits_charged: number;
      free_generation_eligible: boolean;
      free_generation_applied: boolean;
      llm_calls: number;
      transaction_ids: string[] | null;
      claim_keys: string[];
    }>(
      `select version_id, status, provider_cost_microusd, provider_cost_ore,
              billable_ore, credits_charged, free_generation_eligible,
              free_generation_applied, llm_calls,
              transaction_ids, claim_keys
         from generation_billings
        where version_id = any($1::text[])
        order by version_id`,
      [[firstVersionId, secondVersionId]],
    );
    expect(billingRows).toHaveLength(2);
    const byVersion = new Map(billingRows.map((row) => [row.version_id, row]));
    expect(byVersion.get(freeSettlement!.versionId)).toMatchObject({
      status: "free_generation",
      provider_cost_microusd: frozenCostMicroUsd,
      provider_cost_ore: expectedCharge.providerCostOre,
      billable_ore: expectedCharge.billableOre,
      credits_charged: 0,
      free_generation_eligible: true,
      free_generation_applied: true,
      llm_calls: 1,
      transaction_ids: [],
    });
    expect(byVersion.get(chargedSettlement!.versionId)).toMatchObject({
      status: "charged",
      provider_cost_microusd: frozenCostMicroUsd,
      provider_cost_ore: expectedCharge.providerCostOre,
      billable_ore: expectedCharge.billableOre,
      credits_charged: expectedCharge.credits,
      free_generation_eligible: true,
      free_generation_applied: false,
      llm_calls: 1,
    });
    expect(byVersion.get(firstVersionId)?.claim_keys).toEqual([
      `claim-${firstVersionId}`,
      `claim-extra-${firstVersionId}`,
    ]);
    expect(byVersion.get(secondVersionId)?.claim_keys).toEqual([`claim-${secondVersionId}`]);

    const { rows: transactionRows } = await pool.query<{
      id: string;
      type: string;
      amount: number;
      balance_after: number;
    }>(
      `select id, type, amount, balance_after
         from transactions
        where user_id = $1
        order by created_at, id`,
      [userId],
    );
    expect(transactionRows).toEqual([
      {
        id: expect.any(String),
        type: "generation_usage",
        amount: -expectedCharge.credits,
        balance_after: initialBalance - expectedCharge.credits,
      },
    ]);
    expect(byVersion.get(chargedSettlement!.versionId)?.transaction_ids).toEqual([
      transactionRows[0].id,
    ]);

    // Simulera usage som hann skrivas efter den interaktiva attachningen och
    // blev kvar utan version. Den durabla claim-nyckeln ska kunna återkoppla
    // raden exakt utan tidsfönster innan nästa settlement.
    await pool.query(
      `insert into llm_usage (
         id, chat_id, version_id, user_id, phase, provider, model,
         input_tokens, cached_input_tokens, cache_write_tokens, output_tokens,
         reasoning_tokens, cost_microusd, pricing_version, cost_breakdown, meta, ok
       ) values (
         $1, $2, null, $3, 'late-verifier', 'openai', $4,
         0, 0, 0, 0, 0, 0, 'gbtest-v1', $5, $6, true
       )`,
      [
        lateUsageId,
        chatId,
        userId,
        model,
        JSON.stringify({
          ...(calculateModelCost(model, {
            inputTokens: 0,
            cachedInputTokens: 0,
            cacheWriteTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
          }) ?? {}),
          priceVersion: "gbtest-v1",
        }),
        JSON.stringify({ claimKey: `claim-${firstVersionId}` }),
      ],
    );
    await billing.reattributeGenerationBillingUsage({
      chatId,
      versionId: firstVersionId,
      claimKeys: [`claim-${firstVersionId}`],
    });
    await billing.settleGenerationBilling({ chatId, versionId: firstVersionId, userId });

    const { rows: recoveredRows } = await pool.query<{
      version_id: string | null;
      llm_calls: number;
    }>(
      `select lu.version_id, gb.llm_calls
         from llm_usage lu
         join generation_billings gb on gb.version_id = $2
        where lu.id = $1`,
      [lateUsageId, firstVersionId],
    );
    expect(recoveredRows[0]).toEqual({ version_id: firstVersionId, llm_calls: 2 });
  }, 60_000);
});
