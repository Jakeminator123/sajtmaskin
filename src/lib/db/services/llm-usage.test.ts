import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const returningRows = vi.hoisted(() => ({ value: [] as Array<{ id: string }> }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    select: () => ({ from: () => ({ where: (where: unknown) => {
      updateWhere.value = where;
      return { limit: () => Promise.resolve(returningRows.value) };
    } }) }),
    update: () => ({
      set: () => ({
        where: (where: unknown) => {
          updateWhere.value = where;
          return {
            returning: () => Promise.resolve(returningRows.value),
          };
        },
      }),
    }),
  },
}));

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

import { attachVersionToUnassignedLlmUsage, hasRecordedBriefUsageClaim } from "./llm-usage";

function renderWhere(): { sql: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(updateWhere.value as never);
  return { sql: query.sql.toLowerCase(), params: query.params };
}

describe("attachVersionToUnassignedLlmUsage", () => {
  beforeEach(() => {
    updateWhere.value = undefined;
    returningRows.value = [];
  });

  it("lets an exact claim-key retry attach early rows even after a later verifier row was versioned", async () => {
    // First attribution only saw the verifier row; the earlier provider rows
    // arrived late and are still unversioned when the settlement retry runs.
    // The global MAX(versioned.created_at) cutoff would incorrectly reject
    // those earlier rows even though all three rows share this exact request key.
    returningRows.value = [{ id: "provider-early-1" }, { id: "provider-early-2" }];

    await expect(
      attachVersionToUnassignedLlmUsage("chat-1", "version-1", {
        claimKey: "request-claim-1",
      }),
    ).resolves.toBe(2);

    const { sql, params } = renderWhere();
    expect(sql).toContain('version_id" is null');
    expect(sql).toContain("->> 'claimkey'");
    expect(params).toContain("request-claim-1");
    expect(sql).not.toContain("max(prior.created_at)");
  });

  it("keeps the prior-version cutoff for legacy attribution without a claim key", async () => {
    await attachVersionToUnassignedLlmUsage("chat-1", "version-2");

    const { sql } = renderWhere();
    expect(sql).toContain("max(prior.created_at)");
    expect(sql).not.toContain("->> 'claimkey'");
  });

  it("keeps parallel exact runs isolated by claim key", async () => {
    await attachVersionToUnassignedLlmUsage("chat-1", "version-a", {
      claimKey: "parallel-a",
    });

    const { sql, params } = renderWhere();
    expect(sql).toContain("->> 'claimkey'");
    expect(params).toContain("parallel-a");
    expect(params).not.toContain("parallel-b");
  });
});

describe("hasRecordedBriefUsageClaim", () => {
  it("requires an actual fresh brief row for the exact owner and request, not merely a drained write", async () => {
    returningRows.value = [];
    await expect(hasRecordedBriefUsageClaim("owner-1", "brief-claim")).resolves.toBe(false);
    const { sql, params } = renderWhere();
    expect(params).toEqual(expect.arrayContaining(["owner-1", "brief", "brief-claim"]));
    expect(sql).toContain('"llm_usage"."user_id"');
    expect(sql).toContain("->> 'claimkey'");
    expect(sql).toContain('"llm_usage"."chat_id" is null');
    expect(sql).toContain('"llm_usage"."version_id" is null');
    returningRows.value = [{ id: "brief-row" }];
    await expect(hasRecordedBriefUsageClaim("owner-1", "brief-claim")).resolves.toBe(true);
  });
});
