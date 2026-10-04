// @vitest-environment node
/**
 * Mail register cohort and metadata against real Postgres.
 *
 * Why DB-backed: the A/B denominator and the locked first-send/metadata write
 * are SQL (`EXISTS`, `FOR UPDATE`, `WHERE sent_at IS NULL`, `jsonb ||`). The
 * unit tests mock the database and never see that SQL run, so this file runs
 * the real service functions against the database and checks the results.
 *
 * Determinism: stats are global, so every assertion compares a before/after
 * delta, and every row carries a unique run prefix (deleted in afterAll).
 *
 * Safety: writes fixture rows and refuses every target except dev through the
 * repository's own check-db-env-target helper (CI: the ephemeral Postgres).
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveDevDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };
  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  return verdict.ok
    ? { url: resolved.value, reason: verdict.message }
    : { url: null, reason: verdict.message };
}

const target = resolveDevDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[kostnadsfri-mail-cohort.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kohortkontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

type Service = typeof import("@/lib/db/services/kostnadsfri");

describe.skipIf(!target.url)("kostnadsfri mail cohort mot riktig Postgres", () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const slug = (name: string) => `cohort-${run}-${name}`;
  const messageId = (n: number) => `${run}${String(n).padStart(20, "0")}`;
  let pool: Pool;
  let service: Service;

  const baseEvent = {
    recipient: "hej@acme.example",
    sender: "hej@sajtmaskin.se",
    flowId: `flow_${run}`,
    scheduledAt: new Date("2026-10-03T08:00:00.000Z"),
    deliveredAt: null,
    repliedAt: null,
  };
  const textSource = "render-mail-flow:text";
  const animatedSource = "render-mail-flow:animated";

  async function stats() {
    const s = await service.getKostnadsfriMailEventStats();
    const of = (variant: "text" | "animated") =>
      s.byVariant.find((row) => row.variant === variant) ?? { firstAccepted: 0, total: 0 };
    return { text: of("text"), animated: of("animated") };
  }

  async function page(slugValue: string) {
    const rows = await pool.query(
      "select sent_at, source, contact_email, extra_data from kostnadsfri_pages where slug = $1",
      [slugValue],
    );
    return rows.rows[0];
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: target.url!, ssl: resolveSslConfig(target.url!), max: 2 });
    service = await import("@/lib/db/services/kostnadsfri");
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from kostnadsfri_mail_events where slug like $1", [`cohort-${run}-%`]);
    await pool.query("delete from kostnadsfri_pages where slug like $1", [`cohort-${run}-%`]);
    await pool.end();
  });

  it("counts a company once, in the cohort of its preserved source, after delayed acceptance and a variant switch", async () => {
    const before = await stats();
    const created = await service.createKostnadsfriPage({
      slug: slug("switch"),
      passwordHash: "hash",
      companyName: "Switch AB",
    });

    // t1: text mail A is only scheduled.
    await service.recordKostnadsfriMailEventForSubscribedPage({
      ...baseEvent,
      messageId: messageId(1),
      pageId: created.id,
      slug: slug("switch"),
      step: "first",
      variant: "text",
      smtpAcceptedAt: null,
      outcome: "scheduled",
      source: textSource,
    });
    // t2: animated mail B is accepted first and fills the cohort.
    await service.recordKostnadsfriMailEventForSubscribedPage(
      {
        ...baseEvent,
        messageId: messageId(2),
        pageId: created.id,
        slug: slug("switch"),
        step: "first",
        variant: "animated",
        smtpAcceptedAt: new Date("2026-10-03T08:10:00.000Z"),
        outcome: "accepted",
        source: animatedSource,
      },
      {
        firstSend: { sentAt: new Date("2026-10-03T08:10:00.000Z"), source: animatedSource },
      },
    );
    // t3: text mail A is accepted later; the cohort must not move.
    await service.recordKostnadsfriMailEventForSubscribedPage(
      {
        ...baseEvent,
        messageId: messageId(1),
        pageId: created.id,
        slug: slug("switch"),
        step: "first",
        variant: "text",
        smtpAcceptedAt: new Date("2026-10-03T08:20:00.000Z"),
        outcome: "accepted",
        source: textSource,
      },
      { firstSend: { sentAt: new Date("2026-10-03T08:20:00.000Z"), source: textSource } },
    );

    const after = await stats();
    expect((await page(slug("switch"))).source).toBe(animatedSource);
    expect(after.animated.firstAccepted - before.animated.firstAccepted).toBe(1);
    expect(after.text.firstAccepted - before.text.firstAccepted).toBe(0);
    // Every event is kept.
    expect(after.text.total - before.text.total).toBe(1);
    expect(after.animated.total - before.animated.total).toBe(1);
  });

  it("keeps a legacy text company in the text cohort when its first stored event is animated", async () => {
    const before = await stats();
    const created = await service.createKostnadsfriPage({
      slug: slug("legacy"),
      passwordHash: "hash",
      companyName: "Legacy AB",
      sentAt: new Date("2026-09-01T08:00:00.000Z"),
      source: textSource,
    });
    await service.recordKostnadsfriMailEventForSubscribedPage(
      {
        ...baseEvent,
        messageId: messageId(3),
        pageId: created.id,
        slug: slug("legacy"),
        step: "first",
        variant: "animated",
        smtpAcceptedAt: new Date("2026-10-03T09:00:00.000Z"),
        outcome: "accepted",
        source: animatedSource,
      },
      { firstSend: { sentAt: new Date("2026-10-03T09:00:00.000Z"), source: animatedSource } },
    );

    const after = await stats();
    expect((await page(slug("legacy"))).source).toBe(textSource);
    expect(after.text.firstAccepted - before.text.firstAccepted).toBe(1);
    expect(after.animated.firstAccepted - before.animated.firstAccepted).toBe(0);
  });

  it("refreshes contact/profile from a follow-up and an already-sent first, and changes nothing on conflict", async () => {
    const created = await service.createKostnadsfriPage({
      slug: slug("meta"),
      passwordHash: "hash",
      companyName: "Meta AB",
      contactEmail: "old@meta.example",
      extraData: { openclaw: { roleLabel: "Kvar" } },
      sentAt: new Date("2026-10-01T08:00:00.000Z"),
      source: textSource,
    });
    const accepted = {
      ...baseEvent,
      pageId: created.id,
      slug: slug("meta"),
      smtpAcceptedAt: new Date("2026-10-03T10:00:00.000Z"),
      outcome: "accepted" as const,
    };

    const follow = await service.recordKostnadsfriMailEventForSubscribedPage(
      { ...accepted, messageId: messageId(4), step: "follow", variant: "animated", source: animatedSource },
      { metadata: { contactEmail: "follow@meta.example", extraDataPatch: { profile: { city: "Lund" } } } },
    );
    expect(follow.status).toBe("created");
    let row = await page(slug("meta"));
    expect(row).toMatchObject({ source: textSource, contact_email: "follow@meta.example" });
    expect(row.sent_at.toISOString()).toBe("2026-10-01T08:00:00.000Z");
    expect(row.extra_data).toEqual({ openclaw: { roleLabel: "Kvar" }, profile: { city: "Lund" } });

    await service.recordKostnadsfriMailEventForSubscribedPage(
      { ...accepted, messageId: messageId(5), step: "first", variant: "animated", source: animatedSource },
      {
        firstSend: { sentAt: new Date("2026-10-03T10:00:00.000Z"), source: animatedSource },
        metadata: { contactEmail: "first@meta.example" },
      },
    );
    row = await page(slug("meta"));
    expect(row).toMatchObject({ source: textSource, contact_email: "first@meta.example" });
    expect(row.sent_at.toISOString()).toBe("2026-10-01T08:00:00.000Z");

    // Same messageId with different facts: conflict, zero metadata change.
    const conflict = await service.recordKostnadsfriMailEventForSubscribedPage(
      {
        ...accepted,
        messageId: messageId(5),
        flowId: "another-flow",
        step: "first",
        variant: "animated",
        source: animatedSource,
      },
      { metadata: { contactEmail: "conflict@meta.example", extraDataPatch: { profile: { city: "X" } } } },
    );
    expect(conflict.status).toBe("conflict");
    row = await page(slug("meta"));
    expect(row.contact_email).toBe("first@meta.example");
    expect(row.extra_data.profile).toEqual({ city: "Lund" });
  });

  it("writes no receipt for a deleted page and keeps the messageId reusable", async () => {
    const created = await service.createKostnadsfriPage({
      slug: slug("deleted"),
      passwordHash: "hash",
      companyName: "Deleted fixture AB",
    });
    // Reproduce deletion between the route lookup and the service's locked read.
    await pool.query("delete from kostnadsfri_pages where id = $1", [created.id]);
    const input = {
      ...baseEvent,
      messageId: messageId(7),
      pageId: created.id,
      slug: slug("deleted"),
      step: "first" as const,
      variant: "text" as const,
      smtpAcceptedAt: new Date("2026-10-03T11:00:00.000Z"),
      outcome: "accepted" as const,
      source: textSource,
    };
    expect(await service.recordKostnadsfriMailEventForSubscribedPage(input)).toEqual({
      status: "missing-page",
    });
    const receipts = await pool.query("select 1 from kostnadsfri_mail_events where message_id = $1", [
      input.messageId,
    ]);
    expect(receipts.rowCount).toBe(0);
    const retry = await service.createKostnadsfriPageWithMailEvent(
      { slug: input.slug, passwordHash: "hash", companyName: "Retry fixture AB" },
      input,
    );
    expect(retry.status).toBe("created");
  });

  it("changes no metadata and writes no event after opt-out", async () => {
    const created = await service.createKostnadsfriPage({
      slug: slug("optout"),
      passwordHash: "hash",
      companyName: "Optout AB",
      contactEmail: "kvar@optout.example",
      extraData: { unsubscribedAt: "2026-10-02T09:00:00.000Z" },
    });
    const result = await service.recordKostnadsfriMailEventForSubscribedPage(
      {
        ...baseEvent,
        messageId: messageId(6),
        pageId: created.id,
        slug: slug("optout"),
        step: "first",
        variant: "text",
        smtpAcceptedAt: new Date("2026-10-03T11:00:00.000Z"),
        outcome: "accepted",
        source: textSource,
      },
      {
        firstSend: { sentAt: new Date("2026-10-03T11:00:00.000Z"), source: textSource },
        metadata: { contactEmail: "ny@optout.example" },
      },
    );
    expect(result).toEqual({ status: "unsubscribed" });
    const row = await page(slug("optout"));
    expect(row).toMatchObject({ sent_at: null, source: null, contact_email: "kvar@optout.example" });
    const events = await pool.query("select 1 from kostnadsfri_mail_events where slug = $1", [
      slug("optout"),
    ]);
    expect(events.rowCount).toBe(0);
  });
});
