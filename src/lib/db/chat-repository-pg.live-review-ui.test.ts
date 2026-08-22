import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const updateSet = vi.hoisted(() => ({ value: undefined as unknown }));
const updateWhere = vi.hoisted(() => ({ value: undefined as unknown }));
const rowCount = vi.hoisted(() => ({ value: 1 }));

vi.mock("@/lib/db/client", () => ({
  dbConfigured: true,
  db: {
    update: () => ({
      set: (value: unknown) => {
        updateSet.value = value;
        return {
          where: (where: unknown) => {
            updateWhere.value = where;
            return Promise.resolve({ rowCount: rowCount.value });
          },
        };
      },
    }),
  },
}));
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import { upsertAssistantMessageUiPart } from "./chat-repository-pg";

function renderSql(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = new PgDialect().sqlToQuery(value as any);
  return { sql: query.sql.toLowerCase(), params: query.params };
}

describe("upsertAssistantMessageUiPart", () => {
  beforeEach(() => {
    updateSet.value = undefined;
    updateWhere.value = undefined;
    rowCount.value = 1;
  });

  it("deduplicates by toolCallId and persists the Live Review part atomically", async () => {
    const part = {
      type: "tool:live-review",
      toolCallId: "live-review:v2",
      output: { liveReview: { status: "completed" } },
    };
    await expect(upsertAssistantMessageUiPart("chat_1", "msg_2", part)).resolves.toBe(true);

    const set = updateSet.value as Record<string, unknown>;
    const renderedSet = renderSql(set.uiParts);
    expect(renderedSet.sql).toContain("jsonb_array_elements");
    expect(renderedSet.sql).toContain("is distinct from");
    expect(renderedSet.sql).toContain("jsonb_build_array");
    expect(renderedSet.params).toContain("live-review:v2");
    expect(renderedSet.params).toContain(JSON.stringify(part));

    const renderedWhere = renderSql(updateWhere.value);
    expect(renderedWhere.params).toEqual(expect.arrayContaining(["chat_1", "msg_2", "assistant"]));
  });

  it("reports an unconfirmed/missing assistant row", async () => {
    rowCount.value = 0;
    await expect(
      upsertAssistantMessageUiPart("chat_1", "msg_missing", {
        toolCallId: "live-review:v2",
      }),
    ).resolves.toBe(false);
  });
});
