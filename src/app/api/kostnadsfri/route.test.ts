import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getKostnadsfriPageBySlug = vi.hoisted(() => vi.fn());
const createKostnadsfriPage = vi.hoisted(() => vi.fn());
const markKostnadsfriPageSent = vi.hoisted(() => vi.fn());
const listKostnadsfriPages = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/kostnadsfri", () => ({
  getKostnadsfriPageBySlug,
  createKostnadsfriPage,
  markKostnadsfriPageSent,
  listKostnadsfriPages,
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

function getRequest(apiKey: string | null = API_KEY) {
  const headers: Record<string, string> = {};
  if (apiKey !== null) headers["x-api-key"] = apiKey;
  return new NextRequest("http://localhost/api/kostnadsfri", { method: "GET", headers });
}

beforeEach(() => {
  process.env.KOSTNADSFRI_API_KEY = API_KEY;
  process.env.KOSTNADSFRI_PASSWORD_SEED = "test-seed";
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
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.fields).toEqual(["contactPersonalId"]);
    expect(JSON.stringify(body)).not.toContain("19748885-2517");
    expect(getKostnadsfriPageBySlug).not.toHaveBeenCalled();
    expect(createKostnadsfriPage).not.toHaveBeenCalled();
    expect(markKostnadsfriPageSent).not.toHaveBeenCalled();
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
    expect(listKostnadsfriPages).toHaveBeenCalledWith(2000);
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
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("password_hash");
    expect(JSON.stringify(body)).not.toContain("hemligt");
  });
});
