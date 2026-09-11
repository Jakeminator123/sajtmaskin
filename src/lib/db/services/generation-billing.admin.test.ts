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
              providerCostOre: 180,
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
              providerCostOre: 180,
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

  it("sums billable_ore with the same status window as självkostnad", async () => {
    await getGenerationBillingAdminData(30, 50, new Date("2026-09-11T00:00:00.000Z"));
    const usersSql = execute.mock.calls
      .map((call) => renderSql(call[0]))
      .find((sql) => sql.includes("group by gb.user_id"));

    expect(usersSql).toEqual(expect.stringContaining("sum(gb.provider_cost_ore)"));
    expect(usersSql).toEqual(expect.stringContaining("sum(gb.billable_ore)"));
    expect(usersSql).not.toMatch(/status\s+in\s*\(/);
    expect(usersSql).not.toMatch(/status\s+not\s+in\s*\(/);
  });

  it("keeps a free generation's negative margin visible", async () => {
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
        providerCostOre: 180,
        billableOre: 0,
        marginOre: -180,
        creditsCharged: 0,
        freeGenerations: 1,
      },
    ]);
  });
});
