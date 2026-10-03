import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  pages: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  entitlementWhere: [] as unknown[],
}));

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("@/lib/db/client", async () => {
  const schema = await import("@/lib/db/schema");
  const insertInto = (table: PgTable) => ({
    values: (row: Record<string, unknown>) => {
      const commit = () => {
        if (table === schema.kostnadsfriPages) {
          const page = { id: state.pages.length + 1, ...row };
          state.pages.push(page);
          return [page];
        }
        if (state.events.some((event) => event.message_id === row.message_id)) return [];
        state.events.push(row);
        return [row];
      };
      return {
        returning: async () => commit(),
        onConflictDoNothing: () => ({ returning: async () => commit() }),
      };
    },
  });
  return {
    db: {
      transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const snapshot = structuredClone({ pages: state.pages, events: state.events });
        try {
          return await run({ insert: insertInto });
        } catch (error) {
          state.pages = snapshot.pages;
          state.events = snapshot.events;
          throw error;
        }
      },
      insert: insertInto,
      select: () => ({
        from: () => {
          const rows = Promise.resolve([]);
          return Object.assign(rows, {
            where: async (clause: SQL) => {
              state.entitlementWhere.push(new PgDialect().sqlToQuery(clause).params);
              return [];
            },
          });
        },
      }),
    },
  };
});

import {
  createKostnadsfriPageWithMailEvent,
  getKostnadsfriGenerationBySlug,
  isAllowedMailOutcomeTransition,
} from "./kostnadsfri";

const page = { slug: "acme-ab", passwordHash: "hash", companyName: "Acme AB" };
const mailEvent = {
  messageId: "a".repeat(32),
  recipient: "hej@acme.se",
  sender: "hej@sajtmaskin.se",
  flowId: "flow_1",
  step: "first" as const,
  variant: "text" as const,
  scheduledAt: null,
  smtpAcceptedAt: new Date("2026-10-03T08:30:00.000Z"),
  deliveredAt: null,
  repliedAt: null,
  outcome: "accepted" as const,
  source: "render-mail-flow:text",
};

beforeEach(() => {
  state.pages = [];
  state.events = [];
  state.entitlementWhere = [];
});

describe("createKostnadsfriPageWithMailEvent (mock transaction, never live DB)", () => {
  it("commits the page and its receipt together", async () => {
    const result = await createKostnadsfriPageWithMailEvent(page, mailEvent);

    expect(result.status).toBe("created");
    expect(state.pages).toHaveLength(1);
    expect(state.events).toEqual([
      expect.objectContaining({ message_id: "a".repeat(32), kostnadsfri_page_id: 1, slug: "acme-ab" }),
    ]);
  });

  it("rolls the new page back when the messageId is already registered", async () => {
    state.events.push({ message_id: "a".repeat(32), slug: "other-ab" });

    const result = await createKostnadsfriPageWithMailEvent(page, mailEvent);

    expect(result).toEqual({ status: "conflict" });
    expect(state.pages).toEqual([]);
    expect(state.events).toHaveLength(1);
  });
});

describe("getKostnadsfriGenerationBySlug", () => {
  it("skips the database for an empty slug list", async () => {
    expect((await getKostnadsfriGenerationBySlug([])).size).toBe(0);
    expect(state.entitlementWhere).toEqual([]);
  });

  it("filters entitlements by the requested slugs instead of reading the table", async () => {
    await getKostnadsfriGenerationBySlug(["acme-ab", "beta-ab", "acme-ab"]);

    expect(state.entitlementWhere).toEqual([["acme-ab", "beta-ab"]]);
  });
});

describe("isAllowedMailOutcomeTransition", () => {
  it("only moves forward towards accepted", () => {
    expect(isAllowedMailOutcomeTransition("scheduled", "uncertain")).toBe(true);
    expect(isAllowedMailOutcomeTransition("scheduled", "failed")).toBe(true);
    expect(isAllowedMailOutcomeTransition("failed", "accepted")).toBe(true);
    expect(isAllowedMailOutcomeTransition("uncertain", "accepted")).toBe(true);
    expect(isAllowedMailOutcomeTransition("failed", "failed")).toBe(true);
  });

  it("rejects backwards and sideways moves", () => {
    expect(isAllowedMailOutcomeTransition("failed", "scheduled")).toBe(false);
    expect(isAllowedMailOutcomeTransition("uncertain", "failed")).toBe(false);
    expect(isAllowedMailOutcomeTransition("failed", "uncertain")).toBe(false);
    expect(isAllowedMailOutcomeTransition("accepted", "failed")).toBe(false);
    expect(isAllowedMailOutcomeTransition("accepted", "scheduled")).toBe(false);
  });
});
