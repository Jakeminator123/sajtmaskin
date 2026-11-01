import { beforeEach, describe, expect, it, vi } from "vitest";

const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getProjectData = vi.hoisted(() => vi.fn());
const saveProjectData = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
  getProjectData,
  saveProjectData,
}));

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest: () => "sess_1",
}));

import { GET, PATCH } from "./route";

const PROJECT_ID = "proj_1";

function makeRequest(body?: unknown): Request {
  return new Request(`http://localhost/api/projects/${PROJECT_ID}/preferences`, {
    method: body !== undefined ? "PATCH" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id = PROJECT_ID) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getProjectByIdForOwner.mockReset();
  getProjectData.mockReset();
  saveProjectData.mockReset();
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: "user_1" });
  getProjectByIdForOwner.mockResolvedValue({ id: PROJECT_ID });
});

describe("GET /api/projects/[id]/preferences", () => {
  it("rejects an oversized project id before ownership lookup", async () => {
    const res = await GET(makeRequest() as never, makeParams("x".repeat(201)));

    expect(res.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

  it("returns SEO defaults when project has no meta yet", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferences: unknown };
    expect(body.preferences).toEqual({
      seo: { optIn: false, siteUrl: null, brand: null, lastSetAt: null },
      business: {
        hours: { mode: "unspecified", week: null },
        contact: { phone: null, email: null, orgNumber: null, address: null },
        lastSetAt: null,
      },
    });
  });

  it("returns SEO defaults when meta exists but has no `seo` key", async () => {
    getProjectData.mockResolvedValue({ meta: { someLegacyKey: true } });

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferences: { seo: unknown } };
    expect(body.preferences.seo).toEqual({
      optIn: false,
      siteUrl: null,
      brand: null,
      lastSetAt: null,
    });
  });

  it("returns persisted SEO preferences when meta.seo exists", async () => {
    getProjectData.mockResolvedValue({
      meta: {
        seo: {
          optIn: true,
          siteUrl: "https://kund.se",
          brand: { companyName: "Kund AB", locale: "sv_SE" },
          lastSetAt: "2026-04-25T10:00:00.000Z",
        },
      },
    });

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferences: { seo: unknown } };
    expect(body.preferences.seo).toEqual({
      optIn: true,
      siteUrl: "https://kund.se",
      brand: { companyName: "Kund AB", locale: "sv_SE" },
      lastSetAt: "2026-04-25T10:00:00.000Z",
    });
  });

  it("returns 404 when project owner-check fails", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(404);
  });

  it("does not expose read failures", async () => {
    getProjectData.mockRejectedValue(new Error("database host secret"));

    const res = await GET(makeRequest() as never, makeParams());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "Failed to get project preferences",
    });
  });
});

describe("PATCH /api/projects/[id]/preferences — seo", () => {
  it("rejects an oversized project id before ownership lookup", async () => {
    const res = await PATCH(
      makeRequest({ seo: { optIn: true } }) as never,
      makeParams("x".repeat(201)),
    );

    expect(res.status).toBe(400);
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
  });

  it("does not expose write failures", async () => {
    getProjectData.mockResolvedValue(null);
    saveProjectData.mockRejectedValue(new Error("database host secret"));

    const res = await PATCH(makeRequest({ seo: { optIn: true } }) as never, makeParams());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "Failed to update project preferences",
    });
  });

  it("persists a complete seo opt-in payload", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({
        seo: {
          optIn: true,
          siteUrl: "https://kund.se",
          brand: { companyName: "Kund AB", locale: "sv_SE" },
        },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalledTimes(1);
    const persisted = saveProjectData.mock.calls[0]?.[0] as {
      meta_patch: { seo?: { optIn: boolean; siteUrl: string | null; brand: unknown; lastSetAt: string } };
    };
    expect(persisted.meta_patch.seo?.optIn).toBe(true);
    expect(persisted.meta_patch.seo?.siteUrl).toBe("https://kund.se");
    expect(persisted.meta_patch.seo?.brand).toEqual({ companyName: "Kund AB", locale: "sv_SE" });
    expect(typeof persisted.meta_patch.seo?.lastSetAt).toBe("string");

    const body = (await res.json()) as { preferences: { seo: { optIn: boolean } } };
    expect(body.preferences.seo.optIn).toBe(true);
  });

  it("accepts optIn=true without fallback siteUrl for canonical project URLs", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ seo: { optIn: true } }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalled();
  });

  it("accepts optIn=true with siteUrl=null as canonical-only preference", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ seo: { optIn: true, siteUrl: null } }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalled();
  });

  it("rejects PATCH with non-https siteUrl", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({
        seo: { optIn: true, siteUrl: "http://kund.se" },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("rejects PATCH with malformed siteUrl", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({
        seo: { optIn: true, siteUrl: "not-a-url" },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("rejects PATCH with malformed locale", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({
        seo: {
          optIn: true,
          siteUrl: "https://kund.se",
          brand: { locale: "Swedish" },
        },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(400);
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("accepts seo opt-out without siteUrl", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ seo: { optIn: false } }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    expect(saveProjectData).toHaveBeenCalledTimes(1);
  });

  it("partial PATCH preserves existing seo fields", async () => {
    getProjectData.mockResolvedValue({
      meta: {
        seo: {
          optIn: true,
          siteUrl: "https://kund.se",
          brand: { companyName: "Kund AB" },
          lastSetAt: "2026-04-20T00:00:00.000Z",
        },
      },
    });

    // Only update tagline; siteUrl and companyName should persist
    const res = await PATCH(
      makeRequest({
        seo: { brand: { companyName: "Kund AB", tagline: "Ny tagline" } },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as {
      meta_patch: { seo: { siteUrl: string; brand: { tagline?: string }; optIn: boolean; lastSetAt: string } };
    };
    expect(persisted.meta_patch.seo.siteUrl).toBe("https://kund.se");
    expect(persisted.meta_patch.seo.optIn).toBe(true);
    expect(persisted.meta_patch.seo.brand.tagline).toBe("Ny tagline");
    // lastSetAt is refreshed
    expect(persisted.meta_patch.seo.lastSetAt).not.toBe("2026-04-20T00:00:00.000Z");
  });

  it("ignores the removed allowPlaceholdersInF3 field (placeholders är alltid tillåtna)", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({
        allowPlaceholdersInF3: true,
        seo: { optIn: true, siteUrl: "https://kund.se" },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as {
      meta_patch: Record<string, unknown> & { seo: { optIn: boolean } };
    };
    expect(persisted.meta_patch).not.toHaveProperty("allowPlaceholdersInF3");
    expect(persisted.meta_patch.seo.optIn).toBe(true);
  });

  it("does not write seo key when seo not present in PATCH", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(makeRequest({}) as never, makeParams());

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as { meta_patch: Record<string, unknown> };
    expect(persisted.meta_patch).not.toHaveProperty("seo");
  });

  it("returns 404 when project owner-check fails", async () => {
    getProjectByIdForOwner.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ seo: { optIn: false } }) as never,
      makeParams(),
    );

    expect(res.status).toBe(404);
    expect(saveProjectData).not.toHaveBeenCalled();
  });
});

const REGULAR_WEEK = {
  mon: { closed: false, open: "09:00", close: "17:00" },
  tue: { closed: false, open: "09:00", close: "17:00" },
  wed: { closed: false, open: "09:00", close: "17:00" },
  thu: { closed: false, open: "09:00", close: "17:00" },
  fri: { closed: false, open: "09:00", close: "15:00" },
  sat: { closed: true },
  sun: { closed: true },
};

describe("PATCH /api/projects/[id]/preferences — business", () => {
  it("persists normalized Företagsuppgifter as a whole namespace", async () => {
    getProjectData.mockResolvedValue({ meta: { seo: { optIn: true } } });

    const res = await PATCH(
      makeRequest({
        business: {
          hours: { mode: "regular", week: REGULAR_WEEK },
          contact: {
            phone: "08-123  45 67",
            email: "Info@Kund.SE",
            orgNumber: "5566778899",
            address: { street: "Storgatan 1", postalCode: "12345", city: "Staden" },
          },
        },
      }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as {
      meta_patch: Record<string, unknown> & {
        business: {
          hours: { mode: string };
          contact: { phone: string; email: string; orgNumber: string; address: { postalCode: string } };
          lastSetAt: string;
        };
      };
    };
    // `seo` was not in the patch, so it must not be rewritten from the snapshot.
    expect(persisted.meta_patch).not.toHaveProperty("seo");
    expect(persisted.meta_patch.business.hours.mode).toBe("regular");
    expect(persisted.meta_patch.business.contact.phone).toBe("08-123 45 67");
    expect(persisted.meta_patch.business.contact.email).toBe("info@kund.se");
    expect(persisted.meta_patch.business.contact.orgNumber).toBe("556677-8899");
    expect(persisted.meta_patch.business.contact.address.postalCode).toBe("123 45");
    expect(typeof persisted.meta_patch.business.lastSetAt).toBe("string");

    const body = (await res.json()) as {
      preferences: { business: { hours: { mode: string }; lastSetAt: string | null } };
    };
    expect(body.preferences.business.hours.mode).toBe("regular");
    expect(body.preferences.business.lastSetAt).not.toBeNull();
  });

  it("accepts 24/7 without a week and by-appointment without times", async () => {
    getProjectData.mockResolvedValue(null);

    const always = await PATCH(
      makeRequest({
        business: {
          hours: { mode: "always_open", week: null },
          contact: { phone: null, email: null, orgNumber: null, address: null },
        },
      }) as never,
      makeParams(),
    );
    expect(always.status).toBe(200);

    const appointment = await PATCH(
      makeRequest({
        business: {
          hours: { mode: "by_appointment", week: null },
          contact: { phone: "070-111 22 33", email: null, orgNumber: null, address: null },
        },
      }) as never,
      makeParams(),
    );
    expect(appointment.status).toBe(200);
  });

  it("rejects regular hours without a week, non-quarter times and bad org numbers", async () => {
    getProjectData.mockResolvedValue(null);
    const contact = { phone: null, email: null, orgNumber: null, address: null };

    const noWeek = await PATCH(
      makeRequest({ business: { hours: { mode: "regular", week: null }, contact } }) as never,
      makeParams(),
    );
    expect(noWeek.status).toBe(400);

    const oddTime = await PATCH(
      makeRequest({
        business: {
          hours: {
            mode: "regular",
            week: { ...REGULAR_WEEK, mon: { closed: false, open: "09:10", close: "17:00" } },
          },
          contact,
        },
      }) as never,
      makeParams(),
    );
    expect(oddTime.status).toBe(400);

    const badOrg = await PATCH(
      makeRequest({
        business: {
          hours: { mode: "unspecified", week: null },
          contact: { ...contact, orgNumber: "12-34" },
        },
      }) as never,
      makeParams(),
    );
    expect(badOrg.status).toBe(400);
    expect(saveProjectData).not.toHaveBeenCalled();
  });

  it("clears the namespace with business: null", async () => {
    getProjectData.mockResolvedValue({
      meta: { business: { hours: { mode: "always_open", week: null } } },
    });

    const res = await PATCH(makeRequest({ business: null }) as never, makeParams());

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as { meta_patch: { business: unknown } };
    expect(persisted.meta_patch.business).toBeNull();
    const body = (await res.json()) as { preferences: { business: { hours: { mode: string } } } };
    expect(body.preferences.business.hours.mode).toBe("unspecified");
  });
});

describe("GET /api/projects/[id]/preferences — business", () => {
  it("returns persisted facts and falls back to defaults for malformed meta", async () => {
    getProjectData.mockResolvedValue({
      meta: {
        business: {
          hours: { mode: "always_open", week: null },
          contact: { phone: "08-123 45 67", email: null, orgNumber: null, address: null },
          lastSetAt: "2026-10-22T10:00:00.000Z",
        },
      },
    });
    const ok = await GET(makeRequest() as never, makeParams());
    const okBody = (await ok.json()) as {
      preferences: { business: { hours: { mode: string }; lastSetAt: string } };
    };
    expect(okBody.preferences.business.hours.mode).toBe("always_open");
    expect(okBody.preferences.business.lastSetAt).toBe("2026-10-22T10:00:00.000Z");

    getProjectData.mockResolvedValue({ meta: { business: { hours: "måndag 9-17" } } });
    const malformed = await GET(makeRequest() as never, makeParams());
    const malformedBody = (await malformed.json()) as {
      preferences: { business: { hours: { mode: string } } };
    };
    expect(malformedBody.preferences.business.hours.mode).toBe("unspecified");
  });
});
