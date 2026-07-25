/**
 * Guards the admin data endpoint after the 2026-07-24 renovation.
 *
 * Two classes of self-destruct used to live here:
 *
 * 1. `mega-cleanup` / `cleanup-vercel-projects` listed `api.vercel.com/v9/projects`
 *    and deleted every project the token could see — Sajtmaskin's own production
 *    project included — behind a two-click "🔥 MEGA CLEANUP" button.
 * 2. Every user-deleting action kept only `TEST_USER_EMAIL`, so an admin from
 *    `ADMIN_EMAILS` deleted their OWN account and got locked out.
 *
 * Both are asserted here so they cannot come back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const flushRedisCache = vi.hoisted(() => vi.fn());
const getRedisInfo = vi.hoisted(() => vi.fn());

/** Recorded `db.delete(<table>).where(<condition>)` calls per test. */
const deleteCalls = vi.hoisted(() => [] as { table: string; condition: unknown }[]);

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/data/redis", () => ({ flushRedisCache, getRedisInfo }));

const redisFeature = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/config", () => ({
  PATHS: { dataDir: "/tmp/sajtmaskin-data-test", uploads: "/tmp/sajtmaskin-uploads-test" },
  get FEATURES() {
    return { useRedisCache: redisFeature.enabled };
  },
}));

// Simple stand-ins so conditions are inspectable plain objects.
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  desc: (column: unknown) => ({ op: "desc", column }),
  isNotNull: (column: unknown) => ({ op: "isNotNull", column }),
  isNull: (column: unknown) => ({ op: "isNull", column }),
  lt: (column: unknown, value: unknown) => ({ op: "lt", column, value }),
  notInArray: (column: unknown, values: unknown[]) => ({ op: "notInArray", column, values }),
  sql: (strings: TemplateStringsArray) => ({ op: "sql", text: strings?.join?.("") ?? "" }),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    delete: (table: { name?: string }) => ({
      where: (condition: unknown) => {
        deleteCalls.push({ table: table?.name ?? "unknown", condition });
        return {
          returning: () => Promise.resolve([]),
          then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
        };
      },
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

const ADMIN_EMAIL = "riktig.admin@sajtmaskin.se";

function actionRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/database", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function userDeleteConditions() {
  return deleteCalls
    .filter((call) => call.table === "users")
    .map((call) => call.condition as { op?: string; values?: unknown[] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  deleteCalls.length = 0;
  redisFeature.enabled = true;
  requireAdminAccess.mockResolvedValue({ ok: true, user: { email: ADMIN_EMAIL } });
  flushRedisCache.mockResolvedValue(0);
  getRedisInfo.mockResolvedValue({ connected: false });
});

describe("POST /api/admin/database — Vercel self-destruct is gone", () => {
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

  it("deletes tables in FK-safe order (children before app_projects, users last)", async () => {
    // Bugbot medium on #611: mega-cleanup used to fire the same deletes
    // concurrently, which can trip a foreign-key error and half-clear the DB.
    await POST(actionRequest({ action: "reset-all" }));

    const order = deleteCalls.map((call) => call.table);
    expect(order.indexOf("project_files")).toBeLessThan(order.indexOf("app_projects"));
    expect(order.indexOf("project_data")).toBeLessThan(order.indexOf("app_projects"));
    expect(order.indexOf("images")).toBeLessThan(order.indexOf("app_projects"));
    expect(order.indexOf("domain_orders")).toBeLessThan(order.indexOf("app_projects"));
    // Users last so the acting admin is still resolvable while the rest runs.
    expect(order.indexOf("app_projects")).toBeLessThan(order.indexOf("users"));
    expect(order[order.length - 1]).toBe("users");
  });

  it("mega-cleanup and reset-all delete exactly the same tables", async () => {
    await POST(actionRequest({ action: "reset-all" }));
    const resetOrder = deleteCalls.map((call) => call.table);

    deleteCalls.length = 0;
    await POST(actionRequest({ action: "mega-cleanup" }));
    const megaOrder = deleteCalls.map((call) => call.table);

    expect(megaOrder).toEqual(resetOrder);
  });

  it("mega-cleanup resets data only and never calls the Vercel API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(actionRequest({ action: "mega-cleanup" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.vercel).toBeUndefined();
    expect(body.results.database).toBeDefined();
    expect(body.results.redis).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(flushRedisCache).toHaveBeenCalledTimes(1);
  });

  it("reports failure when a CONFIGURED cache fails to flush", async () => {
    flushRedisCache.mockResolvedValue(-1);

    const response = await POST(actionRequest({ action: "mega-cleanup" }));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.partialSuccess).toBe(true);
  });

  it("succeeds when no cache is configured — nothing to flush is not a failure", async () => {
    // `flushRedisCache()` returns -1 both for "not configured" and "failed";
    // conflating them made every reset report failure in Redis-less environments.
    redisFeature.enabled = false;

    const response = await POST(actionRequest({ action: "reset-all" }));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.message).toMatch(/ingen cache konfigurerad/i);
    expect(flushRedisCache).not.toHaveBeenCalled();
  });

  it("refuses the standalone cache flush when no cache is configured", async () => {
    redisFeature.enabled = false;

    const response = await POST(actionRequest({ action: "flush-redis" }));
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toMatch(/ingen cache/i);
    expect(flushRedisCache).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/database — the acting admin survives", () => {
  it("keeps the acting admin (and the test user) when clearing the users table", async () => {
    await POST(actionRequest({ action: "clear", table: "users" }));

    const conditions = userDeleteConditions();
    expect(conditions).toHaveLength(1);
    expect(conditions[0].op).toBe("notInArray");
    expect(conditions[0].values).toEqual(
      expect.arrayContaining(["test@example.com", ADMIN_EMAIL]),
    );
  });

  it("keeps the acting admin during reset-all", async () => {
    await POST(actionRequest({ action: "reset-all" }));

    const conditions = userDeleteConditions();
    expect(conditions).toHaveLength(1);
    expect(conditions[0].values).toEqual(expect.arrayContaining([ADMIN_EMAIL]));
  });

  it("keeps the acting admin during mega-cleanup", async () => {
    await POST(actionRequest({ action: "mega-cleanup" }));

    const conditions = userDeleteConditions();
    expect(conditions).toHaveLength(1);
    expect(conditions[0].values).toEqual(expect.arrayContaining([ADMIN_EMAIL]));
  });

  it("still protects the test user when the admin email is missing", async () => {
    requireAdminAccess.mockResolvedValue({ ok: true, user: { email: null } });

    await POST(actionRequest({ action: "clear", table: "users" }));

    const conditions = userDeleteConditions();
    expect(conditions[0].values).toEqual(["test@example.com"]);
  });
});

describe("POST /api/admin/database — access control", () => {
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
    expect(deleteCalls).toHaveLength(0);
  });

  it("rejects an unknown action", async () => {
    const response = await POST(actionRequest({ action: "not-a-real-action" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
  });
});
