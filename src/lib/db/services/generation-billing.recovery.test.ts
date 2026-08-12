import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const execute = vi.hoisted(() => vi.fn());
const insertedValues = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const conflictConfigs = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const updatedValues = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    execute,
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          onConflictDoNothing: () => Promise.resolve(),
          onConflictDoUpdate: (config: Record<string, unknown>) => {
            conflictConfigs.push(config);
            return Promise.resolve();
          },
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updatedValues.push(values);
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "billing-1" }]),
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "generation",
                markup_basis_points: 28_000,
                usd_to_sek_ore: 1_050,
                sek_per_credit_ore: 300,
                updated_by: null,
                updated_at: new Date("2026-08-12T00:00:00.000Z"),
              },
            ]),
        }),
      }),
    }),
  },
}));

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

import {
  appendGenerationBillingClaimKey,
  establishGenerationBilling,
  normalizeGenerationBillingClaimKeys,
  reattributeGenerationBillingUsage,
  reconcilePendingGenerationBillings,
} from "./generation-billing";

function renderSql(value: unknown): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(value as never);
  return { sql: query.sql.toLowerCase(), params: query.params };
}

describe("generation billing recovery", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ rows: [] });
    insertedValues.length = 0;
    conflictConfigs.length = 0;
    updatedValues.length = 0;
  });

  it("normalizes persisted claim keys to a distinct non-empty list", () => {
    expect(
      normalizeGenerationBillingClaimKeys([" claim-a ", "claim-a", null, "", "claim-b"]),
    ).toEqual(["claim-a", "claim-b"]);
    expect(normalizeGenerationBillingClaimKeys({ claim: "claim-a" })).toEqual([]);
  });

  it("appends a distinct claim key on conflict without replacing frozen pricing", async () => {
    await establishGenerationBilling({
      chatId: "chat-1",
      versionId: "version-1",
      userId: "user-1",
      claimKey: " claim-a ",
    });

    expect(insertedValues[1]).toMatchObject({
      version_id: "version-1",
      status: "pending",
      free_generation_eligible: true,
      claim_keys: ["claim-a"],
      markup_basis_points: 28_000,
    });
    const conflictSet = conflictConfigs[0]?.set as Record<string, unknown>;
    expect(conflictSet).toMatchObject({ status: "pending" });
    expect(conflictSet).not.toHaveProperty("markup_basis_points");
    expect(conflictSet).not.toHaveProperty("usd_to_sek_ore");
    expect(conflictSet).not.toHaveProperty("sek_per_credit_ore");
    expect(conflictSet).not.toHaveProperty("pricing_version");
    expect(conflictSet).not.toHaveProperty("usage_started_at");

    const rendered = renderSql(conflictSet.claim_keys);
    expect(rendered.sql).toContain("@> jsonb_build_array");
    expect(rendered.sql).toContain("|| jsonb_build_array");
    expect(rendered.params).toContain("claim-a");
  });

  it("persists a non-free policy for markerless post-processing", async () => {
    await establishGenerationBilling({
      chatId: "chat-1",
      versionId: "version-historical",
      userId: "user-1",
      freeGenerationEligible: false,
      usageStartsAtNow: true,
    });

    expect(insertedValues[1]).toMatchObject({
      version_id: "version-historical",
      free_generation_eligible: false,
    });
    expect(renderSql(insertedValues[1]?.usage_started_at).sql).toBe("now()");
    const conflictSet = conflictConfigs[0]?.set as Record<string, unknown>;
    expect(conflictSet).not.toHaveProperty("free_generation_eligible");
    expect(conflictSet).not.toHaveProperty("usage_started_at");
  });

  it("appends to an existing marker without a creation or pricing-reset path", async () => {
    await appendGenerationBillingClaimKey({
      versionId: "version-historical",
      claimKey: " claim-next ",
    });

    expect(insertedValues).toHaveLength(0);
    expect(updatedValues).toHaveLength(1);
    expect(updatedValues[0]).toMatchObject({ status: "pending" });
    expect(updatedValues[0]).not.toHaveProperty("usage_started_at");
    expect(updatedValues[0]).not.toHaveProperty("free_generation_eligible");
    expect(updatedValues[0]).not.toHaveProperty("markup_basis_points");
    const rendered = renderSql(updatedValues[0]?.claim_keys);
    expect(rendered.sql).toContain("@> jsonb_build_array");
    expect(rendered.params).toContain("claim-next");
  });

  it("marks the row pending before exact, age-independent reattribution", async () => {
    await reattributeGenerationBillingUsage({
      chatId: "chat-1",
      versionId: "version-1",
      claimKeys: ["claim-a", "claim-a", "claim-b"],
    });

    expect(execute).toHaveBeenCalledTimes(2);
    const pending = renderSql(execute.mock.calls[0]?.[0]);
    expect(pending.sql).toContain("update generation_billings");
    expect(pending.sql).toContain("set status = 'pending'");
    expect(pending.params).toContain("version-1");

    const attach = renderSql(execute.mock.calls[1]?.[0]);
    expect(attach.sql).toContain("update llm_usage");
    expect(attach.sql).toContain("version_id is null");
    expect(attach.sql).toContain("meta ->> 'claimkey'");
    expect(attach.sql).not.toContain("minutes");
    expect(attach.params).toContain(JSON.stringify(["claim-a", "claim-b"]));
  });

  it("leaves an attachment failure visible as pending", async () => {
    execute.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      reattributeGenerationBillingUsage({
        chatId: "chat-1",
        versionId: "version-1",
        claimKeys: ["claim-a"],
      }),
    ).rejects.toThrow("db unavailable");

    const pending = renderSql(execute.mock.calls[0]?.[0]);
    expect(pending.sql).toContain("set status = 'pending'");
  });

  it("selects every stored/count mismatch regardless of terminal status", async () => {
    await expect(reconcilePendingGenerationBillings(25)).resolves.toEqual({
      attempted: 0,
      settled: 0,
      failed: 0,
    });

    const candidateQuery = renderSql(execute.mock.calls[0]?.[0]);
    expect(candidateQuery.sql).toContain("gb.llm_calls <>");
    expect(candidateQuery.sql).toContain("count(*)::integer");
    expect(candidateQuery.sql).toContain("gb.usage_started_at is null");
    expect(candidateQuery.sql).toContain("counted.created_at >= gb.usage_started_at");
    expect(candidateQuery.sql).toContain("unattached.version_id is null");
    expect(candidateQuery.sql).toContain("gb.claim_keys");
    expect(candidateQuery.sql).not.toMatch(/status in \([^)]*charged[^)]*\)/);
  });
});
