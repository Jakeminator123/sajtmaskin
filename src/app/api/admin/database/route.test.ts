/**
 * Guards the admin data endpoint after the 2026-07-24 renovation.
 *
 * The two actions this file protects used to list `api.vercel.com/v9/projects`
 * and delete every project the access token could see — Sajtmaskin's own
 * production project included — behind a two-click button labelled
 * "🔥 MEGA CLEANUP". `cleanup-vercel-projects` is now retired (410) and
 * `mega-cleanup` is a data-only reset that must never touch the Vercel API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const flushRedisCache = vi.hoisted(() => vi.fn());
const getRedisInfo = vi.hoisted(() => vi.fn());

const deleteReturning = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/data/redis", () => ({ flushRedisCache, getRedisInfo }));

// Minimal drizzle stub: `db.delete(table).where(...).returning(...)` and
// `db.select(...).from(...)`.
vi.mock("@/lib/db/client", () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: deleteReturning,
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ count: 0 }]),
        then: (resolve: (rows: { count: number }[]) => unknown) => resolve([{ count: 0 }]),
      }),
    }),
    execute: () => Promise.resolve({ rows: [{ size: "1 MB" }] }),
  },
}));

vi.mock("@/lib/db/schema", () => {
  const table = (name: string) => ({ name, id: `${name}.id`, project_id: `${name}.project_id` });
  return {
    appProjects: table("app_projects"),
    companyProfiles: table("company_profiles"),
    domainOrders: table("domain_orders"),
    guestUsage: table("guest_usage"),
    images: table("images"),
    mediaLibrary: table("media_library"),
    pageViews: table("page_views"),
    projectData: table("project_data"),
    projectFiles: table("project_files"),
    templateCache: { ...table("template_cache"), expires_at: "template_cache.expires_at" },
    transactions: table("transactions"),
    users: { ...table("users"), email: "users.email" },
  };
});

vi.mock("@/lib/db/services/shared", () => ({
  TEST_USER_EMAIL: "test@example.com",
  getUploadsDir: () => "/tmp/sajtmaskin-uploads-test-does-not-exist",
}));

const { POST } = await import("./route");

function actionRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  requireAdminAccess.mockResolvedValue({ ok: true, user: { email: "admin@example.com" } });
  flushRedisCache.mockResolvedValue(0);
  getRedisInfo.mockResolvedValue({ connected: false });
  deleteReturning.mockResolvedValue([]);
});

describe("POST /api/admin/database", () => {
  it("retires the bulk Vercel cleanup action instead of deleting projects", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(actionRequest({ action: "cleanup-vercel-projects" }));
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/borttagen/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mega-cleanup resets data only and never calls the Vercel API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(actionRequest({ action: "mega-cleanup" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toBeDefined();
    // No Vercel bucket in the result shape anymore — data + cache only.
    expect(body.results.vercel).toBeUndefined();
    expect(body.results.database).toBeDefined();
    expect(body.results.redis).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(flushRedisCache).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the cache flush fails", async () => {
    flushRedisCache.mockResolvedValue(-1);

    const response = await POST(actionRequest({ action: "mega-cleanup" }));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.partialSuccess).toBe(true);
  });

  it("requires admin access", async () => {
    requireAdminAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
      }),
    });

    const response = await POST(actionRequest({ action: "mega-cleanup" }));

    expect(response.status).toBe(403);
    expect(flushRedisCache).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    const response = await POST(actionRequest({ action: "not-a-real-action" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
