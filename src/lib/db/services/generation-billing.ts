import { and, eq, gte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  calculateCustomerCharge,
  calculateModelCost,
  costUsdToMicroUsd,
  DEFAULT_MARKUP_BASIS_POINTS,
  DEFAULT_SEK_PER_CREDIT_ORE,
  DEFAULT_USD_TO_SEK_ORE,
  MODEL_PRICE_VERSION,
  type ModelCost,
} from "@/lib/billing/model-cost";
import { db } from "@/lib/db/client";
import {
  appProjects,
  engineChats,
  generationBillings,
  generationBillingSettings,
  llmUsage,
  transactions,
  users,
} from "@/lib/db/schema";
import { isTestUser } from "./users";
import { assertDbConfigured } from "./shared";
import { InsufficientCreditsError } from "./transactions";

export const GENERATION_BILLING_SETTINGS_ID = "generation";

export type GenerationBillingSettings = {
  markupBasisPoints: number;
  markupMultiplier: number;
  usdToSekOre: number;
  usdToSek: number;
  sekPerCreditOre: number;
  sekPerCredit: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

function mapSettings(
  row: typeof generationBillingSettings.$inferSelect,
): GenerationBillingSettings {
  return {
    markupBasisPoints: row.markup_basis_points,
    markupMultiplier: row.markup_basis_points / 10_000,
    usdToSekOre: row.usd_to_sek_ore,
    usdToSek: row.usd_to_sek_ore / 100,
    sekPerCreditOre: row.sek_per_credit_ore,
    sekPerCredit: row.sek_per_credit_ore / 100,
    updatedAt: row.updated_at?.toISOString() ?? null,
    updatedBy: row.updated_by,
  };
}

async function ensureSettings() {
  await db
    .insert(generationBillingSettings)
    .values({
      id: GENERATION_BILLING_SETTINGS_ID,
      markup_basis_points: DEFAULT_MARKUP_BASIS_POINTS,
      usd_to_sek_ore: DEFAULT_USD_TO_SEK_ORE,
      sek_per_credit_ore: DEFAULT_SEK_PER_CREDIT_ORE,
    })
    .onConflictDoNothing({ target: generationBillingSettings.id });
}

export async function getGenerationBillingSettings(): Promise<GenerationBillingSettings> {
  assertDbConfigured();
  await ensureSettings();
  const rows = await db
    .select()
    .from(generationBillingSettings)
    .where(eq(generationBillingSettings.id, GENERATION_BILLING_SETTINGS_ID))
    .limit(1);
  if (!rows[0]) throw new Error("Generation billing settings missing");
  return mapSettings(rows[0]);
}

export async function updateGenerationBillingSettings(input: {
  markupMultiplier: number;
  usdToSek: number;
  sekPerCredit: number;
  updatedBy: string;
}): Promise<GenerationBillingSettings> {
  assertDbConfigured();
  const markupBasisPoints = Math.round(input.markupMultiplier * 10_000);
  const usdToSekOre = Math.round(input.usdToSek * 100);
  const sekPerCreditOre = Math.round(input.sekPerCredit * 100);
  if (markupBasisPoints < 10_000 || markupBasisPoints > 100_000) {
    throw new RangeError("Påslaget måste vara mellan X1,0 och X10,0.");
  }
  if (usdToSekOre < 100 || usdToSekOre > 10_000) {
    throw new RangeError("USD/SEK måste vara mellan 1 och 100.");
  }
  if (sekPerCreditOre < 1 || sekPerCreditOre > 100_000) {
    throw new RangeError("SEK per credit måste vara mellan 0,01 och 1 000.");
  }

  await ensureSettings();
  const rows = await db
    .update(generationBillingSettings)
    .set({
      markup_basis_points: markupBasisPoints,
      usd_to_sek_ore: usdToSekOre,
      sek_per_credit_ore: sekPerCreditOre,
      updated_by: input.updatedBy,
      updated_at: new Date(),
    })
    .where(eq(generationBillingSettings.id, GENERATION_BILLING_SETTINGS_ID))
    .returning();
  if (!rows[0]) throw new Error("Generation billing settings could not be updated");
  return mapSettings(rows[0]);
}

export type GenerationBillingTarget = {
  chatId: string;
  versionId: string;
  userId?: string | null;
  isTest?: boolean;
  claimKey?: string | null;
  /**
   * Successful own-engine finalize defaults to eligible. Post-processing that
   * has to create a marker for an older/imported version must pass false so it
   * cannot consume the user's one free site generation.
   */
  freeGenerationEligible?: boolean;
  /**
   * Stores database NOW() as an inclusive usage lower bound when the marker is
   * first inserted. Only markerless historical/imported post-processing sets
   * this. Conflict retries never replace the already persisted boundary.
   */
  usageStartsAtNow?: boolean;
};

export function normalizeGenerationBillingClaimKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((claimKey): claimKey is string => typeof claimKey === "string")
        .map((claimKey) => claimKey.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Establishes the durable completion/work marker owned by successful finalize.
 *
 * This is intentionally separate from usage recording: a version id exists
 * while finalize is still running, so verifier/repair usage must never create
 * the first billing row or claim the free-generation entitlement.
 */
export async function establishGenerationBilling(input: GenerationBillingTarget): Promise<void> {
  assertDbConfigured();
  await ensureSettings();
  const settingsRows = await db
    .select()
    .from(generationBillingSettings)
    .where(eq(generationBillingSettings.id, GENERATION_BILLING_SETTINGS_ID))
    .limit(1);
  const settings = settingsRows[0];
  if (!settings) throw new Error("Generation billing settings missing");
  const claimKey = input.claimKey?.trim() || null;
  const now = new Date();

  await db
    .insert(generationBillings)
    .values({
      id: nanoid(),
      version_id: input.versionId,
      chat_id: input.chatId,
      user_id: input.userId ?? null,
      status: "pending",
      free_generation_eligible: input.freeGenerationEligible ?? true,
      claim_keys: claimKey ? [claimKey] : [],
      usage_started_at: input.usageStartsAtNow ? sql`NOW()` : null,
      markup_basis_points: settings.markup_basis_points,
      usd_to_sek_ore: settings.usd_to_sek_ore,
      sek_per_credit_ore: settings.sek_per_credit_ore,
      pricing_version: MODEL_PRICE_VERSION,
    })
    .onConflictDoUpdate({
      target: generationBillings.version_id,
      set: {
        chat_id: input.chatId,
        user_id: sql`COALESCE(${generationBillings.user_id}, ${input.userId ?? null})`,
        status: "pending",
        claim_keys: claimKey
          ? sql`CASE
              WHEN COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
                @> jsonb_build_array(${claimKey}::text)
              THEN COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
              ELSE COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
                || jsonb_build_array(${claimKey}::text)
            END`
          : sql`COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)`,
        updated_at: now,
      },
    });
}

/**
 * Appends a repair request key to an existing marker without an INSERT path.
 * This deliberately cannot create a marker or change its usage boundary,
 * eligibility, or frozen pricing snapshot.
 */
export async function appendGenerationBillingClaimKey(input: {
  versionId: string;
  claimKey?: string | null;
}): Promise<void> {
  assertDbConfigured();
  const claimKey = input.claimKey?.trim();
  if (!claimKey) return;
  const rows = await db
    .update(generationBillings)
    .set({
      status: "pending",
      claim_keys: sql`CASE
        WHEN COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
          @> jsonb_build_array(${claimKey}::text)
        THEN COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
        ELSE COALESCE(${generationBillings.claim_keys}, '[]'::jsonb)
          || jsonb_build_array(${claimKey}::text)
      END`,
      updated_at: new Date(),
    })
    .where(eq(generationBillings.version_id, input.versionId))
    .returning({ id: generationBillings.id });
  if (!rows[0]) throw new Error("Generation billing completion marker missing");
}

type UsageRow = typeof llmUsage.$inferSelect;

export type GenerationQuote = {
  llmCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  providerCostMicroUsd: number;
  firstUsageAt: Date | null;
  lastUsageAt: Date | null;
  unpricedModels: string[];
  estimatedModels: string[];
  incompleteUsageIds: string[];
  pricingVersions: string[];
  breakdown: Array<ModelCost & { phase: string; usageId: string; priceVersion: string }>;
};

export function buildGenerationQuote(rows: UsageRow[]): GenerationQuote {
  const breakdown: GenerationQuote["breakdown"] = [];
  const unpriced = new Set<string>();
  const estimated = new Set<string>();
  const incompleteUsageIds: string[] = [];
  const pricingVersions = new Set<string>();
  let providerCostMicroUsd = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let firstUsageAt: Date | null = null;
  let lastUsageAt: Date | null = null;

  for (const row of rows) {
    inputTokens += row.input_tokens ?? 0;
    cachedInputTokens += row.cached_input_tokens ?? 0;
    cacheWriteTokens += row.cache_write_tokens ?? 0;
    outputTokens += row.output_tokens ?? 0;
    reasoningTokens += row.reasoning_tokens ?? 0;
    if (!firstUsageAt || row.created_at < firstUsageAt) firstUsageAt = row.created_at;
    if (!lastUsageAt || row.created_at > lastUsageAt) lastUsageAt = row.created_at;

    const hasTokenUsage = [
      row.input_tokens,
      row.cached_input_tokens,
      row.cache_write_tokens,
      row.output_tokens,
      row.reasoning_tokens,
    ].some((value) => value !== null);
    if (!hasTokenUsage) incompleteUsageIds.push(row.id);

    const frozenBreakdown =
      row.cost_breakdown &&
      typeof row.cost_breakdown === "object" &&
      !Array.isArray(row.cost_breakdown)
        ? (row.cost_breakdown as ModelCost & { priceVersion?: string })
        : null;
    const priced =
      frozenBreakdown ??
      calculateModelCost(row.model, {
        inputTokens: row.input_tokens,
        cachedInputTokens: row.cached_input_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        outputTokens: row.output_tokens,
        reasoningTokens: row.reasoning_tokens,
      });
    if (!priced) {
      unpriced.add(row.model);
      continue;
    }
    const priceVersion =
      row.pricing_version ?? frozenBreakdown?.priceVersion ?? MODEL_PRICE_VERSION;
    const callCostMicroUsd = row.cost_microusd ?? costUsdToMicroUsd(priced.costUsd);
    providerCostMicroUsd += callCostMicroUsd;
    pricingVersions.add(priceVersion);
    if (priced.estimated) estimated.add(row.model);
    breakdown.push({
      ...priced,
      costUsd: callCostMicroUsd / 1_000_000,
      phase: row.phase,
      usageId: row.id,
      priceVersion,
    });
  }

  return {
    llmCalls: rows.length,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    providerCostMicroUsd,
    firstUsageAt,
    lastUsageAt,
    unpricedModels: [...unpriced].sort(),
    estimatedModels: [...estimated].sort(),
    incompleteUsageIds,
    pricingVersions: [...pricingVersions].sort(),
    breakdown,
  };
}

async function resolveBillingOwner(chatId: string, preferredUserId?: string | null) {
  if (preferredUserId && !preferredUserId.startsWith("guest:")) {
    const preferred = await db.select().from(users).where(eq(users.id, preferredUserId)).limit(1);
    if (preferred[0]) return preferred[0];
  }

  const ownerRows = await db
    .select({ user: users })
    .from(engineChats)
    .leftJoin(appProjects, eq(appProjects.id, engineChats.projectId))
    .leftJoin(users, eq(users.id, appProjects.user_id))
    .where(eq(engineChats.id, chatId))
    .limit(1);
  return ownerRows[0]?.user ?? null;
}

export type SettlementResult = {
  status: string;
  creditsCharged: number;
  creditsAddedThisRun: number;
  creditsRefundedThisRun: number;
  providerCostMicroUsd: number;
  unpricedModels: string[];
  freeGenerationApplied: boolean;
};

export type GenerationChargeDecision = {
  desiredCredits: number;
  status: string;
  freeGenerationApplied: boolean;
  shouldClaimFreeGeneration: boolean;
};

export function resolveGenerationChargeDecision(input: {
  hasOwner: boolean;
  ownerIsTest: boolean;
  hasCompletePrice: boolean;
  hasEstimatedPrice: boolean;
  llmCalls: number;
  hasIncompleteUsage: boolean;
  calculatedCredits: number;
  lockedCredits: number;
  existingFreeGenerationApplied: boolean;
  freeGenerationEligible: boolean;
  freeGenerationAvailable: boolean;
}): GenerationChargeDecision {
  let desiredCredits = input.hasCompletePrice ? input.calculatedCredits : input.lockedCredits;
  let status = input.hasCompletePrice
    ? input.hasEstimatedPrice
      ? "charged_estimated"
      : "charged"
    : input.llmCalls === 0
      ? "no_usage"
      : input.hasIncompleteUsage
        ? "usage_incomplete"
        : "unpriced";

  if (!input.hasCompletePrice && input.lockedCredits > 0) {
    status = "needs_reconciliation";
  }

  const shouldClaimFreeGeneration =
    input.hasOwner &&
    !input.ownerIsTest &&
    input.freeGenerationEligible &&
    !input.existingFreeGenerationApplied &&
    input.lockedCredits === 0 &&
    input.freeGenerationAvailable;
  const freeGenerationApplied = input.existingFreeGenerationApplied || shouldClaimFreeGeneration;

  if (!input.hasOwner) {
    desiredCredits = 0;
    status = "anonymous_unbilled";
  } else if (input.ownerIsTest) {
    desiredCredits = 0;
    status = "test";
  } else if (freeGenerationApplied) {
    // The first successfully-finalized version owns the entitlement even when
    // its telemetry still needs reconciliation. Waive/refund the customer
    // charge independently, but retain the diagnostic status until the usage
    // snapshot is complete enough to label `free_generation`.
    desiredCredits = 0;
    if (input.hasCompletePrice) status = "free_generation";
  } else if (input.hasCompletePrice && desiredCredits === 0) {
    status = "zero_cost";
  }

  return {
    desiredCredits,
    status,
    freeGenerationApplied,
    shouldClaimFreeGeneration,
  };
}

/**
 * Räknar om versionens marker-avgränsade usage och debiterar endast positiv differens.
 * Versionsraden låses i samma DB-transaktion som användarsaldot, vilket gör
 * återförsök och parallella verifier-/repair-anrop idempotenta.
 */
export async function settleGenerationBilling(
  input: GenerationBillingTarget,
): Promise<SettlementResult> {
  assertDbConfigured();

  const owner = await resolveBillingOwner(input.chatId, input.userId);
  const ownerIsTest = input.isTest ?? (owner ? isTestUser(owner) : false);
  const now = new Date();

  return db.transaction(async (tx) => {
    const lockedRows = await tx
      .select()
      .from(generationBillings)
      .where(eq(generationBillings.version_id, input.versionId))
      .for("update");
    const locked = lockedRows[0];
    if (!locked) throw new Error("Generation billing completion marker missing");

    const usageRows = await tx
      .select()
      .from(llmUsage)
      .where(
        locked.usage_started_at
          ? and(
              eq(llmUsage.version_id, input.versionId),
              gte(llmUsage.created_at, locked.usage_started_at),
            )
          : eq(llmUsage.version_id, input.versionId),
      );
    const quote = buildGenerationQuote(usageRows);

    // En äldre, långsammare settlement kan ha räknat på färre usage-rader än
    // en parallell körning som redan hann committa. Låt aldrig den gamla
    // snapshoten skriva över den nyare eller sänka kostnadsunderlaget.
    if (locked.llm_calls > quote.llmCalls) {
      return {
        status: locked.status,
        creditsCharged: locked.credits_charged,
        creditsAddedThisRun: 0,
        creditsRefundedThisRun: 0,
        providerCostMicroUsd: locked.provider_cost_microusd,
        unpricedModels: [],
        freeGenerationApplied: locked.free_generation_applied,
      };
    }

    const customerCharge = calculateCustomerCharge({
      providerCostMicroUsd: quote.providerCostMicroUsd,
      usdToSekOre: locked.usd_to_sek_ore,
      markupBasisPoints: locked.markup_basis_points,
      sekPerCreditOre: locked.sek_per_credit_ore,
    });
    const hasCompletePrice =
      quote.llmCalls > 0 &&
      quote.unpricedModels.length === 0 &&
      quote.incompleteUsageIds.length === 0;

    let lockedUser: {
      diamonds: number;
      freeGenerationAvailable: boolean;
    } | null = null;
    if (owner && !ownerIsTest) {
      const lockedUsers = await tx
        .select({
          diamonds: users.diamonds,
          freeGenerationAvailable: users.free_generation_available,
        })
        .from(users)
        .where(eq(users.id, owner.id))
        .for("update");
      if (!lockedUsers[0]) throw new Error("Billing user not found");
      lockedUser = lockedUsers[0];
    }

    const decision = resolveGenerationChargeDecision({
      hasOwner: Boolean(owner),
      ownerIsTest,
      hasCompletePrice,
      hasEstimatedPrice: quote.estimatedModels.length > 0,
      llmCalls: quote.llmCalls,
      hasIncompleteUsage: quote.incompleteUsageIds.length > 0,
      calculatedCredits: customerCharge.credits,
      lockedCredits: locked.credits_charged,
      existingFreeGenerationApplied: locked.free_generation_applied,
      freeGenerationEligible: locked.free_generation_eligible,
      freeGenerationAvailable: lockedUser?.freeGenerationAvailable ?? false,
    });
    const { desiredCredits, status, freeGenerationApplied } = decision;
    if (owner && decision.shouldClaimFreeGeneration) {
      await tx
        .update(users)
        .set({
          free_generation_available: false,
          free_generation_claimed_version_id: input.versionId,
          free_generation_claimed_at: now,
          updated_at: now,
        })
        .where(eq(users.id, owner.id));
    }

    const creditsToAdd = Math.max(0, desiredCredits - locked.credits_charged);
    const creditsToRefund = Math.max(0, locked.credits_charged - desiredCredits);
    const transactionIds = Array.isArray(locked.transaction_ids) ? [...locked.transaction_ids] : [];

    if (owner && !ownerIsTest && lockedUser && creditsToAdd > 0) {
      if (lockedUser.diamonds < creditsToAdd) {
        throw new InsufficientCreditsError(creditsToAdd, lockedUser.diamonds);
      }
      const balanceAfter = lockedUser.diamonds - creditsToAdd;
      await tx
        .update(users)
        .set({ diamonds: balanceAfter, updated_at: now })
        .where(eq(users.id, owner.id));

      const transactionId = nanoid();
      await tx.insert(transactions).values({
        id: transactionId,
        user_id: owner.id,
        type: "generation_usage",
        amount: -creditsToAdd,
        balance_after: balanceAfter,
        description: `Generering X${(locked.markup_basis_points / 10_000).toFixed(2)} (${(
          customerCharge.providerCostOre / 100
        ).toFixed(2)} kr leverantörskostnad)`,
        created_at: now,
      });
      transactionIds.push(transactionId);
    }

    if (owner && !ownerIsTest && lockedUser && creditsToRefund > 0) {
      const balanceAfter = lockedUser.diamonds + creditsToRefund;
      await tx
        .update(users)
        .set({ diamonds: balanceAfter, updated_at: now })
        .where(eq(users.id, owner.id));

      const transactionId = nanoid();
      await tx.insert(transactions).values({
        id: transactionId,
        user_id: owner.id,
        type: "generation_usage_refund",
        amount: creditsToRefund,
        balance_after: balanceAfter,
        description: `Kostnadsavstämning för generering (${creditsToRefund} credits tillbaka)`,
        created_at: now,
      });
      transactionIds.push(transactionId);
    }

    const totalCredits = locked.credits_charged + creditsToAdd - creditsToRefund;
    await tx
      .update(generationBillings)
      .set({
        chat_id: input.chatId,
        user_id: owner?.id ?? locked.user_id ?? input.userId ?? null,
        status,
        provider_cost_microusd: quote.providerCostMicroUsd,
        provider_cost_ore: customerCharge.providerCostOre,
        billable_ore: customerCharge.billableOre,
        credits_charged: totalCredits,
        free_generation_applied: freeGenerationApplied,
        llm_calls: quote.llmCalls,
        input_tokens: quote.inputTokens,
        cached_input_tokens: quote.cachedInputTokens,
        cache_write_tokens: quote.cacheWriteTokens,
        output_tokens: quote.outputTokens,
        reasoning_tokens: quote.reasoningTokens,
        pricing_version:
          quote.pricingVersions.length > 0 ? quote.pricingVersions.join("+") : MODEL_PRICE_VERSION,
        price_breakdown: {
          calls: quote.breakdown,
          unpricedModels: quote.unpricedModels,
          estimatedModels: quote.estimatedModels,
          incompleteUsageIds: quote.incompleteUsageIds,
        },
        transaction_ids: transactionIds,
        first_usage_at: quote.firstUsageAt,
        last_usage_at: quote.lastUsageAt,
        updated_at: now,
      })
      .where(eq(generationBillings.id, locked.id));

    return {
      status,
      creditsCharged: totalCredits,
      creditsAddedThisRun: creditsToAdd,
      creditsRefundedThisRun: creditsToRefund,
      providerCostMicroUsd: quote.providerCostMicroUsd,
      unpricedModels: quote.unpricedModels,
      freeGenerationApplied,
    };
  });
}

/**
 * Lightweight marker lookup for post-processing preflight. Unlike settlement,
 * this never mutates balance, status, or the free-generation entitlement.
 */
export async function getGenerationBillingMarkerPolicy(
  versionId: string,
): Promise<{ freeGenerationEligible: boolean; freeGenerationApplied: boolean } | null> {
  assertDbConfigured();
  const rows = await db
    .select({
      freeGenerationEligible: generationBillings.free_generation_eligible,
      freeGenerationApplied: generationBillings.free_generation_applied,
    })
    .from(generationBillings)
    .where(eq(generationBillings.version_id, versionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Recalculates late usage only when successful finalize already established
 * the durable billing marker. Returns `null` for an in-progress version and
 * can never create a billing row itself.
 */
export async function settleExistingGenerationBillingIfPresent(
  input: GenerationBillingTarget,
): Promise<SettlementResult | null> {
  assertDbConfigured();
  const rows = await db
    .select({ id: generationBillings.id })
    .from(generationBillings)
    .where(eq(generationBillings.version_id, input.versionId))
    .limit(1);
  if (!rows[0]) return null;
  return settleGenerationBilling(input);
}

export type GenerationBillingReconciliationResult = {
  attempted: number;
  settled: number;
  failed: number;
};

/**
 * Re-opens an existing marker and attaches every persisted request key.
 *
 * Unlike the interactive best-effort attach, this recovery path has no age
 * cutoff: the stored claim key is request-unique and remains the safe boundary
 * even when an operator retries the row days later. Marking the row pending
 * first ensures an attachment or settlement failure stays visible/retriable.
 */
export async function reattributeGenerationBillingUsage(input: {
  chatId: string;
  versionId: string;
  claimKeys: unknown;
}): Promise<void> {
  assertDbConfigured();
  const claimKeys = normalizeGenerationBillingClaimKeys(input.claimKeys);
  await db.execute(sql`
    UPDATE generation_billings
    SET status = 'pending', updated_at = NOW()
    WHERE version_id = ${input.versionId}
  `);
  if (claimKeys.length === 0) return;

  await db.execute(sql`
    UPDATE llm_usage
    SET version_id = ${input.versionId}
    WHERE chat_id = ${input.chatId}
      AND version_id IS NULL
      AND meta ->> 'claimKey' IN (
        SELECT jsonb_array_elements_text(${JSON.stringify(claimKeys)}::jsonb)
      )
  `);
}

/**
 * Retries durable billing rows. Missing rows are deliberately not inferred
 * from versioned usage: a version id exists before finalize has completed, so
 * usage alone is not a safe completion signal. Every retry is idempotent.
 */
export async function reconcilePendingGenerationBillings(
  limit = 100,
): Promise<GenerationBillingReconciliationResult> {
  assertDbConfigured();
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  type Candidate = {
    versionId: string;
    chatId: string;
    userId: string | null;
    claimKeys: unknown;
  };
  const result = await db.execute(sql`
    SELECT
      gb.version_id AS "versionId",
      gb.chat_id AS "chatId",
      gb.user_id AS "userId",
      gb.claim_keys AS "claimKeys"
    FROM generation_billings gb
    WHERE
      gb.status IN (
        'pending',
        'no_usage',
        'usage_incomplete',
        'unpriced',
        'needs_reconciliation'
      )
      OR gb.llm_calls <> (
        SELECT COUNT(*)::integer
        FROM llm_usage counted
        WHERE counted.version_id = gb.version_id
          AND (
            gb.usage_started_at IS NULL
            OR counted.created_at >= gb.usage_started_at
          )
      )
      OR EXISTS (
        SELECT 1
        FROM llm_usage unattached
        WHERE unattached.chat_id = gb.chat_id
          AND unattached.version_id IS NULL
          AND unattached.meta ->> 'claimKey' IS NOT NULL
          AND COALESCE(gb.claim_keys, '[]'::jsonb)
            @> jsonb_build_array(unattached.meta ->> 'claimKey')
      )
    ORDER BY gb.updated_at ASC
    LIMIT ${safeLimit}
  `);
  const candidates = (result as unknown as { rows?: Candidate[] }).rows ?? [];
  let settled = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      await reattributeGenerationBillingUsage({
        chatId: candidate.chatId,
        versionId: candidate.versionId,
        claimKeys: candidate.claimKeys,
      });
      await settleGenerationBilling({
        chatId: candidate.chatId,
        versionId: candidate.versionId,
        userId: candidate.userId,
      });
      settled += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "[generation-billing] Admin reconciliation failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { attempted: candidates.length, settled, failed };
}

export type AdminGenerationBillingRow = {
  id: string;
  versionId: string;
  versionNumber: number | null;
  chatId: string;
  chatTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  status: string;
  providerCostMicroUsd: number;
  providerCostOre: number;
  markupBasisPoints: number;
  billableOre: number;
  usdToSekOre: number;
  sekPerCreditOre: number;
  creditsCharged: number;
  freeGenerationApplied: boolean;
  llmCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  pricingVersion: string;
  priceBreakdown: unknown;
  promptExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getGenerationBillingAdminData(
  days: number,
  limit = 200,
  windowEnd = new Date(),
) {
  assertDbConfigured();
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 365);
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const normalizedWindowEnd = new Date(windowEnd);
  const windowStart = new Date(normalizedWindowEnd.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const settings = await getGenerationBillingSettings();
  const [result, summaryResult, usersResult, providerResult] = await Promise.all([
    db.execute(sql`
    SELECT
      gb.id,
      gb.version_id AS "versionId",
      ev.version_number AS "versionNumber",
      gb.chat_id AS "chatId",
      ec.title AS "chatTitle",
      ap.id AS "projectId",
      ap.name AS "projectName",
      gb.user_id AS "userId",
      u.name AS "userName",
      u.email AS "userEmail",
      gb.status,
      gb.provider_cost_microusd AS "providerCostMicroUsd",
      gb.provider_cost_ore AS "providerCostOre",
      gb.markup_basis_points AS "markupBasisPoints",
      gb.billable_ore AS "billableOre",
      gb.usd_to_sek_ore AS "usdToSekOre",
      gb.sek_per_credit_ore AS "sekPerCreditOre",
      gb.credits_charged AS "creditsCharged",
      gb.free_generation_applied AS "freeGenerationApplied",
      gb.llm_calls AS "llmCalls",
      gb.input_tokens AS "inputTokens",
      gb.cached_input_tokens AS "cachedInputTokens",
      gb.cache_write_tokens AS "cacheWriteTokens",
      gb.output_tokens AS "outputTokens",
      gb.reasoning_tokens AS "reasoningTokens",
      gb.pricing_version AS "pricingVersion",
      gb.price_breakdown AS "priceBreakdown",
      LEFT(prompt.prompt_original, 500) AS "promptExcerpt",
      gb.created_at::text AS "createdAt",
      gb.updated_at::text AS "updatedAt"
    FROM generation_billings gb
    LEFT JOIN engine_versions ev ON ev.id = gb.version_id
    LEFT JOIN engine_chats ec ON ec.id = gb.chat_id
    LEFT JOIN app_projects ap ON ap.id = ec.project_id
    LEFT JOIN users u ON u.id = gb.user_id
    LEFT JOIN LATERAL (
      SELECT pl.prompt_original
      FROM prompt_logs pl
      WHERE pl.chat_id = gb.chat_id
        AND pl.created_at <= gb.created_at
      ORDER BY pl.created_at DESC
      LIMIT 1
    ) prompt ON true
    WHERE gb.created_at >= ${windowStart}
      AND gb.created_at < ${normalizedWindowEnd}
    ORDER BY gb.created_at DESC
    LIMIT ${safeLimit}
  `),
    db.execute(sql`
      SELECT
        COUNT(*)::integer AS generations,
        COALESCE(SUM(provider_cost_ore), 0)::integer AS "providerCostOre",
        COALESCE(SUM(billable_ore), 0)::integer AS "billableOre",
        COALESCE(SUM(credits_charged), 0)::integer AS "creditsCharged",
        COUNT(*) FILTER (WHERE free_generation_applied)::integer AS "freeGenerations",
        COALESCE(SUM(llm_calls), 0)::integer AS "llmCalls"
      FROM generation_billings
      WHERE created_at >= ${windowStart}
        AND created_at < ${normalizedWindowEnd}
    `),
    db.execute(sql`
      SELECT
        gb.user_id AS "userId",
        COALESCE(u.name, u.email, 'Gäst') AS name,
        u.email,
        COUNT(*)::integer AS generations,
        COALESCE(SUM(gb.provider_cost_ore), 0)::integer AS "providerCostOre",
        COALESCE(SUM(gb.credits_charged), 0)::integer AS "creditsCharged",
        COUNT(*) FILTER (WHERE gb.free_generation_applied)::integer AS "freeGenerations"
      FROM generation_billings gb
      LEFT JOIN users u ON u.id = gb.user_id
      WHERE gb.created_at >= ${windowStart}
        AND gb.created_at < ${normalizedWindowEnd}
      GROUP BY gb.user_id, u.name, u.email
      ORDER BY COALESCE(SUM(gb.provider_cost_ore), 0) DESC
    `),
    db.execute(sql`
      SELECT
        COALESCE(
          SUM(
            CASE
              WHEN call ->> 'provider' = 'openai'
                THEN ROUND(COALESCE(NULLIF(call ->> 'costUsd', '')::numeric, 0) * 1000000)
              ELSE 0
            END
          ),
          0
        )::bigint AS "openAiProviderCostMicroUsd"
      FROM generation_billings gb
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gb.price_breakdown -> 'calls', '[]'::jsonb)
      ) AS call
      WHERE gb.created_at >= ${windowStart}
        AND gb.created_at < ${normalizedWindowEnd}
    `),
  ]);
  const rows = ((result as unknown as { rows?: AdminGenerationBillingRow[] }).rows ?? []).map(
    (row) => ({
      ...row,
      providerCostMicroUsd: Number(row.providerCostMicroUsd),
      providerCostOre: Number(row.providerCostOre),
      markupBasisPoints: Number(row.markupBasisPoints),
      billableOre: Number(row.billableOre),
      usdToSekOre: Number(row.usdToSekOre),
      sekPerCreditOre: Number(row.sekPerCreditOre),
      creditsCharged: Number(row.creditsCharged),
      llmCalls: Number(row.llmCalls),
      inputTokens: Number(row.inputTokens),
      cachedInputTokens: Number(row.cachedInputTokens),
      cacheWriteTokens: Number(row.cacheWriteTokens),
      outputTokens: Number(row.outputTokens),
      reasoningTokens: Number(row.reasoningTokens),
    }),
  );

  type SummaryRow = {
    generations: number;
    providerCostOre: number;
    billableOre: number;
    creditsCharged: number;
    freeGenerations: number;
    llmCalls: number;
  };
  const rawSummary = (summaryResult as unknown as { rows?: SummaryRow[] }).rows?.[0];
  const summary = {
    generations: Number(rawSummary?.generations ?? 0),
    providerCostOre: Number(rawSummary?.providerCostOre ?? 0),
    billableOre: Number(rawSummary?.billableOre ?? 0),
    creditsCharged: Number(rawSummary?.creditsCharged ?? 0),
    freeGenerations: Number(rawSummary?.freeGenerations ?? 0),
    llmCalls: Number(rawSummary?.llmCalls ?? 0),
    openAiProviderCostMicroUsd: Number(
      (
        providerResult as unknown as {
          rows?: Array<{ openAiProviderCostMicroUsd: number }>;
        }
      ).rows?.[0]?.openAiProviderCostMicroUsd ?? 0,
    ),
  };
  type UserSummaryRow = {
    userId: string | null;
    name: string;
    email: string | null;
    generations: number;
    providerCostOre: number;
    creditsCharged: number;
    freeGenerations: number;
  };
  const usersSummary = ((usersResult as unknown as { rows?: UserSummaryRow[] }).rows ?? []).map(
    (row) => ({
      ...row,
      generations: Number(row.generations),
      providerCostOre: Number(row.providerCostOre),
      creditsCharged: Number(row.creditsCharged),
      freeGenerations: Number(row.freeGenerations),
    }),
  );

  return {
    settings,
    days: safeDays,
    windowStart: windowStart.toISOString(),
    windowEnd: normalizedWindowEnd.toISOString(),
    summary,
    users: usersSummary,
    generations: rows,
  };
}
