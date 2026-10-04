import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  row: {} as Record<string, unknown>,
  reads: 0,
  writes: 0,
}));
vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [state.reads++ === 0 ? state.snapshot : state.row] }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: (clause: SQL) => ({
          returning: async () => {
            const query = new PgDialect().sqlToQuery(clause);
            // Model a committed competing delivered_at between the read and UPDATE.
            // A guarded UPDATE matches no rows; the actual helper must then re-read
            // and classify the timestamp mismatch as conflict, not duplicate.
            if (
              query.sql.includes('"delivered_at" is null') &&
              query.params.includes("2026-10-03T11:00:02.000Z")
            )
              return [];
            state.writes += 1;
            state.row = { ...state.row, replied_at: new Date("2026-10-03T11:00:03.000Z") };
            return [state.row];
          },
        }),
      }),
    }),
  },
}));
import { recordKostnadsfriMailEvent } from "./kostnadsfri";

describe("mail-event optimistic timestamp update (offline mock)", () => {
  it("rejects a raced delivery timestamp before any partial reply write", async () => {
    const acceptedAt = new Date("2026-10-03T10:00:00.000Z");
    state.reads = 0;
    state.writes = 0;
    state.snapshot = {
      message_id: "a".repeat(32),
      kostnadsfri_page_id: 1,
      slug: "acme-ab",
      recipient: "hej@acme.se",
      sender: "hej@sajtmaskin.se",
      flow_id: "flow_1",
      step: "first",
      variant: "text",
      scheduled_at: null,
      smtp_accepted_at: acceptedAt,
      delivered_at: null,
      replied_at: null,
      outcome: "accepted",
      source: "render-mail-flow:text",
    };
    state.row = { ...state.snapshot, delivered_at: new Date("2026-10-03T11:00:01.000Z") };
    const result = await recordKostnadsfriMailEvent({
      messageId: "a".repeat(32),
      pageId: 1,
      slug: "acme-ab",
      recipient: "hej@acme.se",
      sender: "hej@sajtmaskin.se",
      flowId: "flow_1",
      step: "first",
      variant: "text",
      scheduledAt: null,
      smtpAcceptedAt: acceptedAt,
      deliveredAt: new Date("2026-10-03T11:00:02.000Z"),
      repliedAt: new Date("2026-10-03T11:00:03.000Z"),
      outcome: "accepted",
      source: "render-mail-flow:text",
    });
    expect(result.status).toBe("conflict");
    expect(state.writes).toBe(0);
    expect(state.row.replied_at).toBeNull();
  });
});
