import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// #19 (in-place repair persist clobber): addAssistantMessageAndUpdateExistingVersion
// must bind its version UPDATE to the EXACT files_json the finalize started
// from, so a concurrent user `/files` edit that advanced files_json makes the
// write no-op instead of clobbering the newer state. A 0-row UPDATE with a base
// provided must throw StaleBaseVersionError when files_json advanced (concurrent
// edit) vs the plain "Version not found for chat." for a genuinely missing row.
// We mock the drizzle transaction (insert/update/select chains) to drive both.

const updateWheres = vi.hoisted(() => ({ value: [] as unknown[] }));
const versionsRowCount = vi.hoisted(() => ({ value: 1 }));
// Queue of results returned by successive `tx.select(...).limit()` calls. In the
// 0-row branch only the stale-probe SELECT runs; in the happy path the two
// message/version SELECTs run.
const selectResults = vi.hoisted(() => ({ value: [] as unknown[][] }));

vi.mock("@/lib/db/client", () => {
  const shiftSelect = () => selectResults.value.shift() ?? [];
  const tx = {
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          updateWheres.value.push(w);
          return Promise.resolve({ rowCount: versionsRowCount.value });
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(shiftSelect()) }),
      }),
    }),
  };
  return {
    dbConfigured: true,
    db: {
      transaction: (cb: (t: typeof tx) => unknown) => Promise.resolve(cb(tx)),
    },
  };
});
vi.mock("./promote-guard", () => ({
  assertPromoteAllowed: vi.fn(async () => ({ allowed: true, reason: null })),
}));

import {
  addAssistantMessageAndUpdateExistingVersion,
  StaleBaseVersionError,
} from "./chat-repository-pg";

const BASE_A = '[{"path":"app/page.tsx","content":"A"}]';
const EDITED_B = '[{"path":"app/page.tsx","content":"B"}]';
const NEXT = '[{"path":"app/page.tsx","content":"A-fixed"}]';

function renderQuery(value: unknown): { sql: string; params: unknown[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = new PgDialect().sqlToQuery(value as any);
  return { sql: q.sql.toLowerCase(), params: q.params };
}

function lastVersionsWhere(): unknown {
  // Call order: chats UPDATE first, then the engine_versions UPDATE — so the
  // last captured WHERE is the version write we bind on.
  return updateWheres.value[updateWheres.value.length - 1];
}

describe("addAssistantMessageAndUpdateExistingVersion — optimistic-concurrency base (#19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWheres.value = [];
    versionsRowCount.value = 1;
    selectResults.value = [];
  });

  it("binds the version UPDATE to the exact base files_json when baseFilesJson is provided", async () => {
    // Happy path: rowCount 1 → success. Two trailing SELECTs return the message + version rows.
    versionsRowCount.value = 1;
    selectResults.value = [[{ id: "msg_1" }], [{ id: "ver_1", filesJson: NEXT }]];

    const res = await addAssistantMessageAndUpdateExistingVersion(
      "chat_1",
      "ver_1",
      "assistant text",
      NEXT,
      { baseFilesJson: BASE_A },
    );

    expect(res.message.id).toBe("msg_1");
    expect(res.version.id).toBe("ver_1");

    const { sql, params } = renderQuery(lastVersionsWhere());
    expect(sql).toContain("files_json");
    // The base is bound as a parameter, not re-serialized.
    expect(params).toContain(BASE_A);
  });

  it("throws StaleBaseVersionError when a concurrent edit advanced files_json (0-row + current != base)", async () => {
    versionsRowCount.value = 0;
    selectResults.value = [[{ filesJson: EDITED_B }]]; // stale-probe: advanced past base

    await expect(
      addAssistantMessageAndUpdateExistingVersion("chat_1", "ver_1", "text", NEXT, {
        baseFilesJson: BASE_A,
      }),
    ).rejects.toBeInstanceOf(StaleBaseVersionError);
  });

  it("throws the plain 'Version not found' error when the 0-row no-op is not a concurrent edit (current == base)", async () => {
    versionsRowCount.value = 0;
    selectResults.value = [[{ filesJson: BASE_A }]]; // base predicate matched; row missing for another reason

    await expect(
      addAssistantMessageAndUpdateExistingVersion("chat_1", "ver_1", "text", NEXT, {
        baseFilesJson: BASE_A,
      }),
    ).rejects.toThrow("Version not found for chat.");
  });

  it("throws the plain 'Version not found' error when the version row is gone", async () => {
    versionsRowCount.value = 0;
    selectResults.value = [[]]; // no row

    await expect(
      addAssistantMessageAndUpdateExistingVersion("chat_1", "ver_1", "text", NEXT, {
        baseFilesJson: BASE_A,
      }),
    ).rejects.toThrow("Version not found for chat.");
  });

  it("legacy fallback: with no base it adds no revision predicate and can never be stale", async () => {
    versionsRowCount.value = 0;

    await expect(
      addAssistantMessageAndUpdateExistingVersion("chat_1", "ver_1", "text", NEXT),
    ).rejects.toThrow("Version not found for chat.");

    const { sql } = renderQuery(lastVersionsWhere());
    expect(sql).not.toContain("files_json");
  });
});
