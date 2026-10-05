import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  pages: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  entitlementWhere: [] as unknown[],
  lockedPageExtra: null as unknown,
  lockedPageExists: true,
  lockedPage: { id: 1, sent_at: null, source: null } as Record<string, unknown>,
  pageUpdates: [] as unknown[],
  pageUpdateValues: [] as Record<string, unknown>[],
  locks: 0,
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
          return await run({
            insert: insertInto,
            update: () => ({
              set: (values: Record<string, unknown>) => ({
                where: (clause: SQL) => ({
                  returning: async () => {
                    const query = new PgDialect().sqlToQuery(clause).sql;
                    state.pageUpdates.push(query);
                    // Model `WHERE id = $1 [AND sent_at IS NULL]`.
                    if (/"sent_at" is null/.test(query) && state.lockedPage.sent_at !== null) {
                      return [];
                    }
                    state.pageUpdateValues.push(values);
                    state.lockedPage = { ...state.lockedPage, ...values };
                    return [state.lockedPage];
                  },
                }),
              }),
            }),
            select: () => ({
              from: (table: PgTable) => ({
                where: (clause: SQL) => {
                  if (table === schema.kostnadsfriMailEvents) {
                    const [messageId] = new PgDialect().sqlToQuery(clause).params;
                    return {
                      limit: async () =>
                        state.events.filter((event) => event.message_id === messageId).slice(0, 1),
                    };
                  }
                  return {
                    for: async (strength: string) => {
                      if (strength === "update") state.locks += 1;
                      return state.lockedPageExists
                        ? [{ ...state.lockedPage, extra_data: state.lockedPageExtra }]
                        : [];
                    },
                  };
                },
              }),
            }),
          });
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
  recordKostnadsfriMailEventForSubscribedPage,
  countFirstAcceptedCohorts,
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
  state.lockedPageExtra = null;
  state.lockedPageExists = true;
  state.lockedPage = { id: 1, sent_at: null, source: null };
  state.pageUpdates = [];
  state.pageUpdateValues = [];
  state.locks = 0;
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

describe("recordKostnadsfriMailEventForSubscribedPage (registration vs unsubscribe race)", () => {
  it.each(["first", "follow"] as const)(
    "writes nothing for a disappeared page and leaves the %s messageId retryable",
    async (step) => {
      state.lockedPageExists = false;
      const input = { ...mailEvent, step, pageId: 1, slug: "acme-ab" };
      const result = await recordKostnadsfriMailEventForSubscribedPage(input, {
        firstSend: { sentAt: new Date(), source: "render-mail-flow:text" },
        metadata: { contactEmail: "new@acme.se" },
      });

      expect(result).toEqual({ status: "missing-page" });
      expect(state.events).toEqual([]);
      expect(state.pageUpdateValues).toEqual([]);
      expect(state.locks).toBe(1);

      state.lockedPageExists = true;
      expect((await recordKostnadsfriMailEventForSubscribedPage(input)).status).toBe("created");
      expect(state.events).toHaveLength(1);
    },
  );
  it("writes no receipt when an unsubscribe committed after the route's unlocked lookup", async () => {
    // The route saw a subscribed company; the locked re-read inside the
    // transaction sees the opt-out that committed in between.
    state.lockedPageExtra = { unsubscribedAt: "2026-10-03T08:29:59.000Z" };

    const result = await recordKostnadsfriMailEventForSubscribedPage({
      ...mailEvent,
      step: "follow",
      pageId: 1,
      slug: "acme-ab",
    });

    expect(result).toEqual({ status: "unsubscribed" });
    expect(state.locks).toBe(1);
    expect(state.events).toEqual([]);

    state.lockedPageExtra = null;
    const subscribed = await recordKostnadsfriMailEventForSubscribedPage({
      ...mailEvent,
      pageId: 1,
      slug: "acme-ab",
    });
    expect(subscribed.status).toBe("created");
    expect(state.events).toHaveLength(1);
  });
});

describe("first-send compatibility fields under the registration lock", () => {
  it("lets only the first of two overlapping accepted step=first sends set sentAt/source", async () => {
    const first = await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, pageId: 1, slug: "acme-ab" },
      { firstSend: { sentAt: new Date("2026-10-03T08:30:00.000Z"), source: "render-mail-flow:text" } },
    );
    // The second request also read sent_at=null before it got the lock.
    const second = await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, messageId: "b".repeat(32), variant: "animated", pageId: 1, slug: "acme-ab" },
      {
        firstSend: {
          sentAt: new Date("2026-10-03T08:31:00.000Z"),
          source: "render-mail-flow:animated",
        },
      },
    );

    expect(first.status).toBe("created");
    expect(second.status).toBe("created");
    expect(state.lockedPage).toMatchObject({
      sent_at: new Date("2026-10-03T08:30:00.000Z"),
      source: "render-mail-flow:text",
    });
    expect(state.pageUpdates).toHaveLength(1);
    expect(state.pageUpdates[0]).toMatch(/"sent_at" is null/);
    expect("page" in second && second.page).toMatchObject({
      source: "render-mail-flow:text",
    });
  });
});

describe("countFirstAcceptedCohorts", () => {
  it("assigns each company to the cohort of its preserved source only", () => {
    expect(
      countFirstAcceptedCohorts([
        { source: "render-mail-flow:text", companies: 2 },
        { source: "render-mail-flow:animated", companies: 1 },
        { source: "post-scrape", companies: 4 },
        { source: null, companies: 1 },
      ]),
    ).toEqual({ text: 2, animated: 1 });
  });
});

describe("company metadata vs protected cohort fields", () => {
  const metadata = {
    industry: "IT – AI/Data",
    contactEmail: "ny@acme.se",
    extraDataPatch: { profile: { city: "Lund" } },
  };
  const sent = {
    id: 1,
    sent_at: new Date("2026-10-01T08:00:00.000Z"),
    source: "render-mail-flow:text",
  };

  it("applies contact/profile from an accepted follow-up without touching sent_at/source", async () => {
    state.lockedPage = { ...sent };
    const result = await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, step: "follow", variant: "animated", pageId: 1, slug: "acme-ab" },
      { metadata },
    );

    expect(result.status).toBe("created");
    expect(state.pageUpdateValues).toHaveLength(1);
    expect(state.pageUpdateValues[0]).toHaveProperty("industry", "IT – AI/Data");
    expect(state.pageUpdateValues[0]).toHaveProperty("contact_email", "ny@acme.se");
    expect(state.pageUpdateValues[0]).toHaveProperty("extra_data");
    expect(state.pageUpdateValues[0]).not.toHaveProperty("sent_at");
    expect(state.pageUpdateValues[0]).not.toHaveProperty("source");
    expect(state.lockedPage).toMatchObject({ sent_at: sent.sent_at, source: "render-mail-flow:text" });
  });

  it("applies metadata from a later step=first on an already-sent company, cohort kept", async () => {
    state.lockedPage = { ...sent };
    await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, variant: "animated", pageId: 1, slug: "acme-ab" },
      {
        firstSend: { sentAt: new Date("2026-10-03T08:30:00.000Z"), source: "render-mail-flow:animated" },
        metadata,
      },
    );

    expect(state.pageUpdateValues).toHaveLength(1);
    expect(state.pageUpdateValues[0]).not.toHaveProperty("sent_at");
    expect(state.lockedPage).toMatchObject({
      sent_at: sent.sent_at,
      source: "render-mail-flow:text",
      contact_email: "ny@acme.se",
      industry: "IT – AI/Data",
    });
  });

  it("does not erase a stored industry when accepted metadata omits it or sends whitespace", async () => {
    state.lockedPage = { ...sent, industry: "Snickeri/Inredning" };

    await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, pageId: 1, slug: "acme-ab" },
      { metadata: { industry: "   " } },
    );

    expect(state.pageUpdateValues).toEqual([]);
    expect(state.lockedPage).toHaveProperty("industry", "Snickeri/Inredning");
  });

  it("changes no metadata when a messageId conflicts", async () => {
    state.lockedPage = { ...sent, industry: "Snickeri/Inredning" };
    await recordKostnadsfriMailEventForSubscribedPage({
      ...mailEvent,
      pageId: 1,
      slug: "acme-ab",
    });

    const conflict = await recordKostnadsfriMailEventForSubscribedPage(
      {
        ...mailEvent,
        recipient: "annan@acme.se",
        pageId: 1,
        slug: "acme-ab",
      },
      { metadata },
    );

    expect(conflict.status).toBe("conflict");
    expect(state.pageUpdateValues).toEqual([]);
    expect(state.lockedPage).toHaveProperty("industry", "Snickeri/Inredning");
  });

  it("changes no metadata after opt-out", async () => {
    state.lockedPage = { ...sent };
    state.lockedPageExtra = { unsubscribedAt: "2026-10-02T09:00:00.000Z" };
    const optedOut = await recordKostnadsfriMailEventForSubscribedPage(
      { ...mailEvent, messageId: "c".repeat(32), pageId: 1, slug: "acme-ab" },
      { firstSend: { sentAt: new Date(), source: "render-mail-flow:text" }, metadata },
    );

    expect(optedOut).toEqual({ status: "unsubscribed" });
    expect(state.pageUpdateValues).toEqual([]);
    expect(state.events).toEqual([]);
  });
});
