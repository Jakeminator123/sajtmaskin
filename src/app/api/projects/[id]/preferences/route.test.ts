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

function makeParams() {
  return { params: Promise.resolve({ id: PROJECT_ID }) };
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
  it("returns SEO defaults when project has no meta yet", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await GET(makeRequest() as never, makeParams());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preferences: unknown };
    expect(body.preferences).toEqual({
      allowPlaceholdersInF3: false,
      seo: { optIn: false, siteUrl: null, brand: null, lastSetAt: null },
    });
  });

  it("returns SEO defaults when meta exists but has no `seo` key", async () => {
    getProjectData.mockResolvedValue({ meta: { allowPlaceholdersInF3: true } });

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
});

describe("PATCH /api/projects/[id]/preferences — seo", () => {
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
      meta: { seo?: { optIn: boolean; siteUrl: string | null; brand: unknown; lastSetAt: string } };
    };
    expect(persisted.meta.seo?.optIn).toBe(true);
    expect(persisted.meta.seo?.siteUrl).toBe("https://kund.se");
    expect(persisted.meta.seo?.brand).toEqual({ companyName: "Kund AB", locale: "sv_SE" });
    expect(typeof persisted.meta.seo?.lastSetAt).toBe("string");

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
      meta: { seo: { siteUrl: string; brand: { tagline?: string }; optIn: boolean; lastSetAt: string } };
    };
    expect(persisted.meta.seo.siteUrl).toBe("https://kund.se");
    expect(persisted.meta.seo.optIn).toBe(true);
    expect(persisted.meta.seo.brand.tagline).toBe("Ny tagline");
    // lastSetAt is refreshed
    expect(persisted.meta.seo.lastSetAt).not.toBe("2026-04-20T00:00:00.000Z");
  });

  it("accepts allowPlaceholdersInF3 alongside seo", async () => {
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
      meta: { allowPlaceholdersInF3: boolean; seo: { optIn: boolean } };
    };
    expect(persisted.meta.allowPlaceholdersInF3).toBe(true);
    expect(persisted.meta.seo.optIn).toBe(true);
  });

  it("does not write seo key when seo not present in PATCH", async () => {
    getProjectData.mockResolvedValue(null);

    const res = await PATCH(
      makeRequest({ allowPlaceholdersInF3: false }) as never,
      makeParams(),
    );

    expect(res.status).toBe(200);
    const persisted = saveProjectData.mock.calls[0]?.[0] as { meta: Record<string, unknown> };
    expect(persisted.meta).not.toHaveProperty("seo");
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
