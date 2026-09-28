import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const listKostnadsfriPages = vi.hoisted(() => vi.fn());
const getKostnadsfriVisitStats = vi.hoisted(() => vi.fn());
const getKostnadsfriPixelStats = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/auth/auth", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/db/services/kostnadsfri", () => ({
  createKostnadsfriPage: vi.fn(),
  getKostnadsfriPageBySlug: vi.fn(),
  getKostnadsfriPixelStats,
  getKostnadsfriVisitStats,
  listKostnadsfriPages,
}));
vi.mock("@/lib/kostnadsfri", () => ({
  hasKostnadsfriPasswordSecret: () => true,
  isPageAccessible: () => ({ accessible: true }),
}));
vi.mock("@/lib/kostnadsfri/invite", () => ({
  buildKostnadsfriInvite: vi.fn(),
  KostnadsfriInviteError: class extends Error {},
}));

import { GET } from "./route";

function pageRow() {
  return {
    slug: "acme-ab",
    company_name: "Acme AB",
    industry: null,
    website: null,
    contact_email: "ada@acme.se",
    contact_name: null,
    extra_data: { unsubscribedAt: "2026-09-20T12:00:00.000Z" },
    status: "active",
    created_at: new Date("2026-09-01T10:00:00.000Z"),
    expires_at: null,
    consumed_at: null,
    sent_at: new Date("2026-09-14T08:30:00.000Z"),
    source: "post-scrape",
  };
}

beforeEach(() => {
  requireAdminAccess.mockResolvedValue({ ok: true });
  listKostnadsfriPages.mockResolvedValue([pageRow()]);
  getKostnadsfriVisitStats.mockResolvedValue({
    perSlug: [
      {
        slug: "acme-ab",
        visits: 4,
        visitsByVariant: { rent: 2, animated: 1, unknown: 1 },
        uniqueVisitors: 3,
        uniqueByVariant: { rent: 2, animated: 1, unknown: 1 },
        verified: 1,
        started: 0,
        firstSeen: "2026-09-20T10:00:00.000Z",
        lastSeen: "2026-09-28T10:00:00.000Z",
      },
    ],
    recent: [],
    truncated: false,
  });
  getKostnadsfriPixelStats.mockResolvedValue([
    {
      slug: "acme-ab",
      rent: { hits: 5, firstHitAt: "2026-09-20T08:00:00.000Z", lastHitAt: "2026-09-21T08:00:00.000Z" },
      animated: { hits: 2, firstHitAt: "2026-09-22T08:00:00.000Z", lastHitAt: "2026-09-22T09:00:00.000Z" },
    },
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/kostnadsfri", () => {
  it("returns visit variants, pixel-träffar and unsubscribedAt for the period", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/kostnadsfri?days=7"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getKostnadsfriVisitStats).toHaveBeenCalledWith(7);
    expect(getKostnadsfriPixelStats).toHaveBeenCalledWith(7);
    expect(body.pages[0]).toMatchObject({
      slug: "acme-ab",
      sentAt: "2026-09-14T08:30:00.000Z",
      source: "post-scrape",
      unsubscribedAt: "2026-09-20T12:00:00.000Z",
    });
    expect(body.stats[0].visitsByVariant).toEqual({ rent: 2, animated: 1, unknown: 1 });
    expect(body.pixels[0]).toEqual({
      slug: "acme-ab",
      rent: { hits: 5, firstHitAt: "2026-09-20T08:00:00.000Z", lastHitAt: "2026-09-21T08:00:00.000Z" },
      animated: { hits: 2, firstHitAt: "2026-09-22T08:00:00.000Z", lastHitAt: "2026-09-22T09:00:00.000Z" },
    });
    expect(JSON.stringify(body)).not.toContain("öppnade");
    expect(JSON.stringify(body)).not.toContain("pixelHits");
  });
});
