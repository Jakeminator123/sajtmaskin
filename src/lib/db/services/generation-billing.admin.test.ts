import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const execute = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    execute,
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(),
      }),
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

const { getGenerationBillingAdminData } = await import("./generation-billing");

function renderSql(value: unknown): string {
  return new PgDialect().sqlToQuery(value as never).sql.toLowerCase();
}

function billedQueries() {
  const rendered = execute.mock.calls.map((call) => renderSql(call[0]));
  return {
    summary: rendered.find(
      (sql) => sql.includes("count(*)") && sql.includes("from generation_billings") && !sql.includes("join"),
    ),
    users: rendered.find((sql) => sql.includes("group by gb.user_id")),
  };
}

describe("getGenerationBillingAdminData user totals", () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockImplementation((query) => {
      const sql = renderSql(query);
      if (sql.includes("group by gb.user_id")) {
        return {
          rows: [
            {
              userId: "user_1",
              name: "Ada",
              email: "ada@example.com",
              generations: 1,
              providerCostOre: 300,
              billableOre: 0,
              creditsCharged: 0,
              freeGenerations: 1,
            },
          ],
        };
      }
      if (sql.includes("openai")) {
        return { rows: [{ openAiProviderCostMicroUsd: 0 }] };
      }
      if (sql.includes("count(*)")) {
        return {
          rows: [
            {
              generations: 1,
              providerCostOre: 300,
              billableOre: 0,
              creditsCharged: 0,
              freeGenerations: 1,
              llmCalls: 1,
            },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it("filters list-price billable_ore the same way in summary and user totals", async () => {
    await getGenerationBillingAdminData(30, 50, new Date("2026-09-11T00:00:00.000Z"));
    const { summary, users } = billedQueries();

    expect(summary).toBeDefined();
    expect(users).toBeDefined();
    for (const sql of [summary, users]) {
      expect(sql).toEqual(expect.stringContaining("sum("));
      expect(sql).toMatch(/filter\s*\(\s*where\s+not/i);
      expect(sql).toEqual(expect.stringContaining("free_generation_applied"));
      expect(sql).toEqual(expect.stringContaining("'charged'"));
      expect(sql).toEqual(expect.stringContaining("'charged_estimated'"));
      expect(sql).toEqual(expect.stringContaining("'needs_reconciliation'"));
      expect(sql).not.toMatch(/sum\([^)]*provider_cost_ore[^)]*\)\s+filter/i);
    }
  });

  it("maps a free generation's filtered totals to negative margin", async () => {
    const data = await getGenerationBillingAdminData(
      30,
      50,
      new Date("2026-09-11T00:00:00.000Z"),
    );
    expect(data.users).toEqual([
      {
        userId: "user_1",
        name: "Ada",
        email: "ada@example.com",
        generations: 1,
        providerCostOre: 300,
        billableOre: 0,
        marginOre: -300,
        creditsCharged: 0,
        freeGenerations: 1,
      },
    ]);
    expect(data.summary).toMatchObject({
      providerCostOre: 300,
      billableOre: 0,
    });
  });
});
