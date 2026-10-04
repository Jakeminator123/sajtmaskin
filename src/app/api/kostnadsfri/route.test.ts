import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());
const createKostnadsfriPage = vi.hoisted(() => vi.fn());
const markKostnadsfriPageSent = vi.hoisted(() => vi.fn());
const listKostnadsfriPages = vi.hoisted(() => vi.fn());
const listKostnadsfriPagesAfterId = vi.hoisted(() => vi.fn());
const getKostnadsfriVisitStats = vi.hoisted(() => vi.fn());
const getKostnadsfriGenerationBySlug = vi.hoisted(() => vi.fn());
const recordKostnadsfriMailEventForSubscribedPage = vi.hoisted(() => vi.fn());
const createKostnadsfriPageWithMailEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
  createKostnadsfriPage,
  markKostnadsfriPageSent,
  listKostnadsfriPages,
  listKostnadsfriPagesAfterId,
  getKostnadsfriVisitStats,
  getKostnadsfriGenerationBySlug,
  recordKostnadsfriMailEventForSubscribedPage,
  createKostnadsfriPageWithMailEvent,
}));

vi.mock("@/lib/auth/auth", () => ({
  hashPassword: vi.fn((password: string) => `hash:${password}`),
}));

import { GET, POST } from "./route";

const API_KEY = "test-api-key";

/** Minimal stored row; only the fields the route serializes matter here. */
function pageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: "acme-ab",
    password_hash: "hash:hemligt",
    company_name: "Acme AB",
    industry: null,
    website: null,
    contact_email: null,
    contact_name: null,
    extra_data: null,
    status: "active",
    created_at: new Date("2026-09-01T10:00:00.000Z"),
    updated_at: new Date("2026-09-01T10:00:00.000Z"),
    expires_at: null,
    consumed_at: null,
    sent_at: null,
    source: null,
    ...overrides,
  };
}

function postRequest(body: unknown, apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new NextRequest("http://localhost/api/kostnadsfri", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function getRequest(apiKey: string | null = API_KEY, query = "") {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new NextRequest(`http://localhost/api/kostnadsfri${query}`, { method: "GET", headers });
}

beforeEach(() => {
  process.env.KOSTNADSFRI_API_KEY = API_KEY;
  process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
  getKostnadsfriVisitStats.mockResolvedValue({ perSlug: [], recent: [], truncated: false });
  getKostnadsfriGenerationBySlug.mockResolvedValue(new Map());
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.KOSTNADSFRI_API_KEY;
  delete process.env.KOSTNADSFRI_PASSWORD_SEED;
});

describe("POST /api/kostnadsfri", () => {
  it("rejects a missing or wrong api key", async () => {
    for (const key of [null, "fel-nyckel"]) {
      const res = await POST(postRequest({ companyName: "Acme AB" }, key));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    }
    expect(getKostnadsfriPageBySlug).not.toHaveBeenCalled();
  });

  it("still conflicts with 409 on an existing slug when sentAt is absent", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());

    const res = await POST(postRequest({ companyName: "Acme AB" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: 'A page with slug "acme-ab" already exists',
    });
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
  });

  it("records the send on an existing slug when sentAt is present", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    markKostnadsfriPageSent.mockResolvedValueOnce(
      pageRow({
        sent_at: new Date("2026-09-14T08:30:00.000Z"),
        source: "python-utskick",
        contact_email: "hej@acme.se",
      }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        contactEmail: "hej@acme.se",
        sentAt: "2026-09-14T10:30:00+02:00",
        source: "python-utskick",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(markKostnadsfriPageSent).toHaveBeenCalledWith("acme-ab", {
      sentAt: new Date("2026-09-14T08:30:00.000Z"),
      source: "python-utskick",
      contactEmail: "hej@acme.se",
    });
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
    expect(body.success).toBe(true);
    expect(body.updated).toBe(true);
    expect(body.page).toMatchObject({
      slug: "acme-ab",
      companyName: "Acme AB",
      contactEmail: "hej@acme.se",
      sentAt: "2026-09-14T08:30:00.000Z",
      source: "python-utskick",
    });
    // A stored custom password cannot be derived from the seed, so none is echoed.
    expect(body.page).not.toHaveProperty("password");
    expect(body.page).not.toHaveProperty("extraData");
  });

  it("registers a send on an existing slug even when the password seed is missing", async () => {
    // Review finding: a pure sent_at update must not depend on the seed.
    // Only the API key authorises the caller; the slug is derived without secrets.
    delete process.env.KOSTNADSFRI_PASSWORD_SEED;
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    markKostnadsfriPageSent.mockResolvedValueOnce(
      pageRow({ sent_at: new Date("2026-09-14T08:30:00.000Z"), source: "python-utskick" }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-09-14T08:30:00Z",
        source: "python-utskick",
      }),
    );

    expect(res.status).toBe(200);
    expect(markKostnadsfriPageSent).toHaveBeenCalledWith("acme-ab", {
      sentAt: new Date("2026-09-14T08:30:00.000Z"),
      source: "python-utskick",
      contactEmail: undefined,
    });
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
    expect((await res.json()).updated).toBe(true);
  });

  it("defaults source to `api` when the send is registered without one", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    markKostnadsfriPageSent.mockResolvedValueOnce(
      pageRow({ sent_at: new Date("2026-09-14T08:30:00.000Z"), source: "api" }),
    );

    const res = await POST(postRequest({ companyName: "Acme AB", sentAt: "2026-09-14T08:30:00Z" }));

    expect(res.status).toBe(200);
    expect(markKostnadsfriPageSent).toHaveBeenCalledWith(
      "acme-ab",
      expect.objectContaining({ source: "api" }),
    );
  });

  it("creates a new slug with sent_at and source set", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockImplementationOnce(async (data: Record<string, unknown>) =>
      pageRow({
        slug: data.slug,
        company_name: data.companyName,
        sent_at: data.sentAt,
        source: data.source,
      }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-09-14T08:30:00.000Z",
        source: "python-utskick",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "acme-ab",
        sentAt: new Date("2026-09-14T08:30:00.000Z"),
        source: "python-utskick",
      }),
    );
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect(body.updated).toBe(false);
    expect(body.page.sentAt).toBe("2026-09-14T08:30:00.000Z");
    expect(body.page.source).toBe("python-utskick");
    // The create path still hands back the credentials for the mail.
    expect(typeof body.page.password).toBe("string");
    expect(body.page.url.endsWith("/kostnadsfri/acme-ab")).toBe(true);
  });

  it("creates without send metadata when sentAt is absent", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockResolvedValueOnce(pageRow());

    const res = await POST(postRequest({ companyName: "Acme AB" }));

    expect(res.status).toBe(200);
    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({ sentAt: undefined, source: undefined }),
    );
  });

  it("records a follow-up as a separate idempotent event without overwriting the first send", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(
      pageRow({
        sent_at: new Date("2026-10-01T08:00:00.000Z"),
        source: "render-mail-flow:text",
      }),
    );
    recordKostnadsfriMailEventForSubscribedPage.mockResolvedValueOnce({
      status: "duplicate",
      event: { message_id: "a".repeat(32) },
      page: pageRow({
        sent_at: new Date("2026-10-01T08:00:00.000Z"),
        source: "render-mail-flow:text",
      }),
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        contactEmail: "hej@acme.se",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:animated",
        mailEvent: {
          messageId: "a".repeat(32),
          flowId: "flow_1",
          step: "follow",
          variant: "animated",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          scheduledAt: "2026-10-03T08:25:00.000Z",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(recordKostnadsfriMailEventForSubscribedPage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "a".repeat(32),
        step: "follow",
        variant: "animated",
      }),
      { firstSend: undefined },
    );
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect(body.mailEvent).toEqual({ messageId: "a".repeat(32), status: "duplicate" });
    expect(body.page).toMatchObject({
      sentAt: "2026-10-01T08:00:00.000Z",
      source: "render-mail-flow:text",
    });
  });

  it("rejects a follow-up after the company has unsubscribed", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(
      pageRow({
        sent_at: new Date("2026-10-01T08:00:00.000Z"),
        source: "render-mail-flow:text",
        extra_data: { unsubscribedAt: "2026-10-02T09:00:00.000Z" },
      }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        contactEmail: "hej@acme.se",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:animated",
        mailEvent: {
          messageId: "f".repeat(32),
          flowId: "flow_1",
          step: "follow",
          variant: "animated",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/unsubscribed/i);
    expect(recordKostnadsfriMailEventForSubscribedPage).not.toHaveBeenCalled();
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
  });

  it("rejects a first mail after the company has unsubscribed", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(
      pageRow({ extra_data: { unsubscribedAt: "2026-10-02T09:00:00.000Z" } }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        contactEmail: "hej@acme.se",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:text",
        mailEvent: {
          messageId: "c".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/unsubscribed/i);
    expect(recordKostnadsfriMailEventForSubscribedPage).not.toHaveBeenCalled();
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
  });

  it("creates page and mail event together and returns 409 without a page on messageId conflict", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPageWithMailEvent.mockResolvedValueOnce({ status: "conflict" });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:text",
        mailEvent: {
          messageId: "d".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(409);
    expect(createKostnadsfriPageWithMailEvent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "acme-ab", source: "render-mail-flow:text" }),
      expect.objectContaining({ messageId: "d".repeat(32), step: "first" }),
    );
    // The non-transactional create is never used when a mailEvent is present.
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
    expect(recordKostnadsfriMailEventForSubscribedPage).not.toHaveBeenCalled();
  });

  it("returns the created page and receipt from the transactional create", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPageWithMailEvent.mockResolvedValueOnce({
      status: "created",
      page: pageRow({ id: 7, sent_at: new Date("2026-10-03T08:30:00.000Z") }),
      event: { message_id: "9".repeat(32) },
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:text",
        mailEvent: {
          messageId: "9".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.mailEvent).toEqual({ messageId: "9".repeat(32), status: "created" });
    expect(body.page).toMatchObject({ id: 7, slug: "acme-ab", sentAt: "2026-10-03T08:30:00.000Z" });
  });

  it("keeps the first recorded sentAt/source when a later step=first arrives", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(
      pageRow({ sent_at: new Date("2026-10-01T08:00:00.000Z"), source: "render-mail-flow:text" }),
    );
    recordKostnadsfriMailEventForSubscribedPage.mockResolvedValueOnce({
      status: "created",
      event: { message_id: "8".repeat(32) },
      page: pageRow({ sent_at: new Date("2026-10-01T08:00:00.000Z"), source: "render-mail-flow:text" }),
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:animated",
        mailEvent: {
          messageId: "8".repeat(32),
          flowId: "flow_2",
          step: "first",
          variant: "animated",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect((await res.json()).page).toMatchObject({
      sentAt: "2026-10-01T08:00:00.000Z",
      source: "render-mail-flow:text",
    });
  });

  it("fills the first-send fields inside the locked registration, never via a separate update", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    recordKostnadsfriMailEventForSubscribedPage.mockResolvedValueOnce({
      status: "created",
      event: { message_id: "7".repeat(32) },
      page: pageRow({ sent_at: new Date("2026-10-03T08:30:00.000Z"), source: "render-mail-flow:text" }),
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:text",
        mailEvent: {
          messageId: "7".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(recordKostnadsfriMailEventForSubscribedPage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "7".repeat(32), pageId: 1 }),
      {
        firstSend: expect.objectContaining({
          sentAt: new Date("2026-10-03T08:30:00.000Z"),
          source: "render-mail-flow:text",
        }),
      },
    );
    // The unconditional, unlocked compatibility update is never used here.
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect((await res.json()).page).toMatchObject({ sentAt: "2026-10-03T08:30:00.000Z" });
  });

  it("rejects message-id reuse with different facts", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    recordKostnadsfriMailEventForSubscribedPage.mockResolvedValueOnce({
      status: "conflict",
      event: { message_id: "b".repeat(32) },
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-10-03T08:30:00.000Z",
        source: "render-mail-flow:text",
        mailEvent: {
          messageId: "b".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          smtpAcceptedAt: "2026-10-03T08:30:00.000Z",
          outcome: "accepted",
        },
      }),
    );

    expect(res.status).toBe(409);
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
  });

  it("records preparation without claiming SMTP acceptance in the company register", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    recordKostnadsfriMailEventForSubscribedPage.mockResolvedValueOnce({
      status: "created",
      event: { message_id: "e".repeat(32) },
      page: pageRow(),
    });

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        mailEvent: {
          messageId: "e".repeat(32),
          flowId: "flow_1",
          step: "first",
          variant: "text",
          sender: "hej@sajtmaskin.se",
          recipient: "hej@acme.se",
          scheduledAt: "2026-10-03T08:25:00.000Z",
          outcome: "scheduled",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(recordKostnadsfriMailEventForSubscribedPage).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpAcceptedAt: null,
        source: "render-mail-flow:text",
        outcome: "scheduled",
      }),
      { firstSend: undefined },
    );
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect((await res.json()).page).toMatchObject({ sentAt: null, source: null });
  });

  it("rejects a sentAt without timezone", async () => {
    const res = await POST(postRequest({ companyName: "Acme AB", sentAt: "2026-09-14 10:30:00" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Validation failed");
    expect(getKostnadsfriPageBySlug).not.toHaveBeenCalled();
  });
});

// Ägarbeslut 2026-09-15: utskicksverktyget får pusha in en allowlistad
// bolagsprofil, och personnummer är hårdspärrade. Fältlista och motiv i
// `src/lib/kostnadsfri/company-profile.ts`.
describe("POST /api/kostnadsfri — bolagsprofil", () => {
  const profile = {
    orgNumber: "5595995639",
    registeredOffice: "Stockholm",
    city: "Kista",
    postalCode: "164 40",
    streetAddress: "c/o Klippoteket Zax 2000 AB, Kistagången",
    businessDescription: "Bolaget skall bedriva frisörverksamhet samt därmed förenlig verksamhet.",
    registeredAt: "2026-07-10",
  };

  it("lagrar den normaliserade profilen på extra_data vid create", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockResolvedValueOnce(pageRow());

    const res = await POST(postRequest({ companyName: "Acme AB", profile }));

    expect(res.status).toBe(200);
    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({
        extraData: { profile: { ...profile, orgNumber: "559599-5639" } },
      }),
    );
  });

  it("behåller openclaw-konfigurationen bredvid profilen", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockResolvedValueOnce(pageRow());

    await POST(
      postRequest({
        companyName: "Acme AB",
        openclaw: { roleLabel: "Sajtagenten" },
        profile: { city: "Kista" },
      }),
    );

    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({
        extraData: { openclaw: { roleLabel: "Sajtagenten" }, profile: { city: "Kista" } },
      }),
    );
  });

  it("patchar profilen på upsert-vägen när utskicket registreras", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(pageRow());
    markKostnadsfriPageSent.mockResolvedValueOnce(
      pageRow({ sent_at: new Date("2026-09-14T08:30:00.000Z"), source: "python-utskick" }),
    );

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-09-14T08:30:00Z",
        source: "python-utskick",
        profile: { city: "Kista" },
      }),
    );

    expect(res.status).toBe(200);
    expect(markKostnadsfriPageSent).toHaveBeenCalledWith(
      "acme-ab",
      expect.objectContaining({ extraDataPatch: { profile: { city: "Kista" } } }),
    );
  });

  it("avvisar personnummerformade värden med fältnamn men aldrig värdet", async () => {
    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        profile: { city: "Kista", contactPersonalId: "19748885-2517" },
      }),
    );
    const raw = await res.text();
    const body = JSON.parse(raw) as { fields?: string[] };

    expect(res.status).toBe(400);
    expect(body.fields).toEqual(["profile"]);
    expect(raw).not.toContain("19748885-2517");
    expect(raw).not.toContain("contactPersonalId");
    expect(getKostnadsfriPageBySlug).not.toHaveBeenCalled();
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
  });

  it("ekar inte en avsändarstyrd personnummer-nyckel i create-svaret eller loggen", async () => {
    const sentinel = "19811228-9874";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        profile: { [sentinel]: sentinel },
      }),
    );
    const raw = await res.text();
    const body = JSON.parse(raw) as { fields?: string[] };

    expect(res.status).toBe(400);
    expect(body.fields).toEqual(["profile"]);
    expect(raw).not.toContain(sentinel);
    expect(consoleError.mock.calls.flat().map(String).join(" ")).not.toContain(sentinel);
    expect(createKostnadsfriPage).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("avvisar PII på sentAt-upsert-vägen utan att patcha extra_data", async () => {
    const sentinel = "Ledamot850101-1234";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        sentAt: "2026-09-14T08:30:00Z",
        source: "python-utskick",
        profile: { businessDescription: sentinel },
      }),
    );
    const raw = await res.text();
    const body = JSON.parse(raw) as { fields?: string[] };

    expect(res.status).toBe(400);
    expect(body.fields).toEqual(["businessDescription"]);
    expect(raw).not.toContain(sentinel);
    expect(raw).not.toContain("850101-1234");
    expect(consoleError.mock.calls.flat().map(String).join(" ")).not.toContain(sentinel);
    expect(getKostnadsfriPageBySlug).not.toHaveBeenCalled();
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
    expect(createKostnadsfriPage).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("avvisar prefix, suffix och typografisk separator i hela HTTP-svaret", async () => {
    for (const value of ["Ledamot850101-1234", "850101-1234x", "850101\u20131234", "1981 12 28-9874"]) {
      const res = await POST(postRequest({ companyName: "Acme AB", profile: { city: value } }));
      const raw = await res.text();
      const body = JSON.parse(raw) as { fields?: string[] };

      expect(res.status).toBe(400);
      expect(body.fields).toEqual(["city"]);
      expect(raw).not.toContain(value);
      expect(raw).not.toContain("850101");
      expect(raw).not.toContain("1981 12 28");
      expect(createKostnadsfriPage).not.toHaveBeenCalled();
    }
  });

  it("avvisar mellanslag runt separatorn och osynliga tecken i hela HTTP-svaret", async () => {
    for (const value of [
      "850101 - 1234",
      "850101- 1234",
      "850101 -1234",
      "850101\u200B-\u200B1234",
      "850101\u00AD-1234",
      "850101\u20151234",
    ]) {
      const res = await POST(postRequest({ companyName: "Acme AB", profile: { city: value } }));
      const raw = await res.text();
      const body = JSON.parse(raw) as { fields?: string[] };

      expect(res.status).toBe(400);
      expect(body.fields).toEqual(["city"]);
      expect(raw).not.toContain(value);
      expect(raw).not.toContain("850101");
      expect(createKostnadsfriPage).not.toHaveBeenCalled();
    }
  });

  it("lagrar legitim bolagsdata med telefon, postnummer, belopp och ISO-datum", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockResolvedValueOnce(pageRow());

    const businessDescription =
      "omsättning 100000 - 200000 kr, 100 000-200 000, lägst 100000 och högst 500000. Ring 070-123 45 67, 0701234567, +46 70 123 45 67 eller 08-123 45 67. Post 164 40. Pris 25.000 SEK.";
    const res = await POST(
      postRequest({
        companyName: "Acme AB",
        profile: {
          orgNumber: "559599-5639",
          postalCode: "164 40",
          registeredAt: "2026-07-10T14:30:00+02:00",
          businessDescription,
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({
        extraData: {
          profile: {
            orgNumber: "559599-5639",
            postalCode: "164 40",
            registeredAt: "2026-07-10",
            businessDescription,
          },
        },
      }),
    );
  });

  it("avvisar ett orgNumber som inte är ett organisationsnummer", async () => {
    const res = await POST(
      postRequest({ companyName: "Acme AB", profile: { orgNumber: "5595-99" } }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/organisationsnummer/);
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
  });

  it("tappar fält utanför allowlisten i stället för att lagra dem", async () => {
    getKostnadsfriPageBySlug.mockResolvedValueOnce(null);
    createKostnadsfriPage.mockResolvedValueOnce(pageRow());

    await POST(
      postRequest({
        companyName: "Acme AB",
        profile: {
          city: "Kista",
          shareCapital: "25.000 SEK",
          homeAddress: "HÖGNÄSVÄGEN 4, 196 34 KUNGSÄNGEN",
        },
      }),
    );

    expect(createKostnadsfriPage).toHaveBeenCalledWith(
      expect.objectContaining({ extraData: { profile: { city: "Kista" } } }),
    );
  });

  // Parameteriserad SQL skyddar frågan, inte felutdatan: ett Drizzle-fel bär
  // querytexten och dess parametrar, och de innehåller här profil, kontakt-
  // e-post och lösenordshash.
  it("läcker inte databasfelets text i svaret eller loggen", async () => {
    const sentinel = "SENTINEL-19748885-2517-hash:hemligt";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getKostnadsfriPageBySlug.mockRejectedValueOnce(
      new Error(`insert into "kostnadsfri_pages" … params: ${sentinel}`),
    );

    const res = await POST(postRequest({ companyName: "Acme AB" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Internt fel. Försök igen senare." });
    expect(JSON.stringify(body)).not.toContain(sentinel);

    const logged = consoleError.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain(sentinel);
    expect(logged).toContain("Failed to create page");

    consoleError.mockRestore();
  });
});

describe("GET /api/kostnadsfri", () => {
  it("rejects a missing or wrong api key", async () => {
    for (const key of [null, "fel-nyckel"]) {
      const res = await GET(getRequest(key));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
    }
    expect(listKostnadsfriPages).not.toHaveBeenCalled();
  });

  it("rejects when the api key is not configured at all", async () => {
    delete process.env.KOSTNADSFRI_API_KEY;

    const res = await GET(getRequest(""));

    expect(res.status).toBe(401);
    expect(listKostnadsfriPages).not.toHaveBeenCalled();
  });

  it("lists the register without credentials or extra_data", async () => {
    listKostnadsfriPages.mockResolvedValueOnce([
      pageRow({
        sent_at: new Date("2026-09-14T08:30:00.000Z"),
        source: "python-utskick",
        contact_email: "hej@acme.se",
        contact_name: "Ada",
        extra_data: { openclaw: { roleLabel: "hemligt" } },
      }),
      pageRow({ id: 2, slug: "beta-ab", company_name: "Beta AB" }),
    ]);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listKostnadsfriPages).toHaveBeenCalledWith(2001);
    expect(body.success).toBe(true);
    expect(body.pages).toEqual([
      {
        slug: "acme-ab",
        companyName: "Acme AB",
        contactEmail: "hej@acme.se",
        contactName: "Ada",
        status: "active",
        sentAt: "2026-09-14T08:30:00.000Z",
        source: "python-utskick",
        createdAt: "2026-09-01T10:00:00.000Z",
        expiresAt: null,
        unsubscribedAt: null,
        visits: 0,
        verified: 0,
        started: 0,
        generation: { state: "not-started", completedAt: null, siteId: null },
      },
      {
        slug: "beta-ab",
        companyName: "Beta AB",
        contactEmail: null,
        contactName: null,
        status: "active",
        sentAt: null,
        source: null,
        createdAt: "2026-09-01T10:00:00.000Z",
        expiresAt: null,
        unsubscribedAt: null,
        visits: 0,
        verified: 0,
        started: 0,
        generation: { state: "not-started", completedAt: null, siteId: null },
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("password_hash");
    expect(JSON.stringify(body)).not.toContain("hemligt");
  });

  it("attaches visit counts and unsubscribedAt without leaking extra_data", async () => {
    listKostnadsfriPages.mockResolvedValueOnce([
      pageRow({
        extra_data: { unsubscribedAt: "2026-09-16T12:00:00.000Z", openclaw: { roleLabel: "hemligt" } },
      }),
    ]);
    getKostnadsfriVisitStats.mockResolvedValueOnce({
      perSlug: [{ slug: "acme-ab", visits: 3, uniqueVisitors: 2, verified: 1, started: 0 }],
      recent: [],
      truncated: false,
    });

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pages[0]).toMatchObject({
      slug: "acme-ab",
      unsubscribedAt: "2026-09-16T12:00:00.000Z",
      visits: 3,
      verified: 1,
      started: 0,
    });
    expect(JSON.stringify(body)).not.toContain("hemligt");
  });

  it("keeps the register valid when analytics is unavailable instead of returning false zeroes", async () => {
    listKostnadsfriPages.mockResolvedValueOnce([pageRow()]);
    getKostnadsfriVisitStats.mockRejectedValueOnce(new Error("analytics unavailable"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.analytics).toMatchObject({ available: false, complete: false, windowDays: 90 });
    expect(body.pages[0]).toMatchObject({ visits: null, verified: null, started: null });
  });

  it("exposes truncation and a stable id cursor instead of treating a capped register as complete", async () => {
    listKostnadsfriPagesAfterId.mockResolvedValueOnce([
      pageRow({ id: 11 }),
      pageRow({ id: 12, slug: "beta-ab" }),
    ]);

    const res = await GET(getRequest(API_KEY, "?cursor=10&limit=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listKostnadsfriPagesAfterId).toHaveBeenCalledWith(10, 2);
    expect(body.pages).toHaveLength(1);
    expect(body.registry).toMatchObject({ complete: false, nextCursor: "11", returned: 1 });
  });

  it("points a capped legacy read at the complete id-ordered walk", async () => {
    listKostnadsfriPages.mockResolvedValueOnce([
      pageRow({ id: 5 }),
      pageRow({ id: 3, slug: "beta-ab" }),
    ]);

    const res = await GET(getRequest(API_KEY, "?limit=1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.registry).toMatchObject({
      complete: false,
      nextCursor: "0",
      paginationMode: "legacy-send-order",
    });
  });

  it("keeps nextCursor null when the legacy read is complete", async () => {
    listKostnadsfriPages.mockResolvedValueOnce([pageRow()]);

    const body = await (await GET(getRequest())).json();

    expect(body.registry).toMatchObject({ complete: true, nextCursor: null });
  });

  it("reads generation state only for the slugs on the returned page", async () => {
    listKostnadsfriPagesAfterId.mockResolvedValueOnce([
      pageRow({ id: 11 }),
      pageRow({ id: 12, slug: "beta-ab" }),
    ]);

    await GET(getRequest(API_KEY, "?cursor=10&limit=1"));

    expect(getKostnadsfriGenerationBySlug).toHaveBeenCalledWith(["acme-ab"]);
  });

  it("rejects a non-canonical numeric registry cursor instead of truncating it", async () => {
    for (const cursor of ["100garbage", "100.9", "-1", "1e3", " 5"]) {
      const res = await GET(getRequest(API_KEY, `?cursor=${encodeURIComponent(cursor)}`));
      expect(res.status).toBe(400);
    }
    expect(listKostnadsfriPagesAfterId).not.toHaveBeenCalled();
  });
});
