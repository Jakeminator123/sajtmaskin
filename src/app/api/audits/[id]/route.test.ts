import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const deleteUserAudit = vi.hoisted(() => vi.fn());
const getUserAuditById = vi.hoisted(() => vi.fn());
const getCachedAudit = vi.hoisted(() => vi.fn());
const invalidateUserAuditCache = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/audits", () => ({ deleteUserAudit, getUserAuditById }));
vi.mock("@/lib/data/redis", () => ({ getCachedAudit, invalidateUserAuditCache }));

const { DELETE, GET } = await import("./route");

function request(method: "GET" | "DELETE"): NextRequest {
  return new NextRequest("http://localhost/api/audits/7", { method });
}

function context(id = "7") {
  return { params: Promise.resolve({ id }) };
}

function storedAudit(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    url: "https://example.com",
    domain: "example.com",
    company_name: "Example",
    score_overall: 81,
    score_seo: 82,
    score_ux: 83,
    score_performance: 84,
    score_security: 85,
    created_at: new Date("2026-07-18T12:00:00.000Z"),
    audit_result: '{"source":"database"}',
    ...overrides,
  };
}

describe("/api/audits/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getCachedAudit.mockResolvedValue(null);
  });

  it("requires authentication for read and delete operations", async () => {
    getCurrentUser.mockResolvedValue(null);

    const getResponse = await GET(request("GET"), context());
    const deleteResponse = await DELETE(request("DELETE"), context());

    expect(getResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
    expect(getUserAuditById).not.toHaveBeenCalled();
    expect(deleteUserAudit).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric id before storage access", async () => {
    const getResponse = await GET(request("GET"), context("not-a-number"));
    const deleteResponse = await DELETE(request("DELETE"), context("not-a-number"));

    expect(getResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(400);
    expect(getCachedAudit).not.toHaveBeenCalled();
    expect(deleteUserAudit).not.toHaveBeenCalled();
  });

  it("verifies ownership even when a cached result exists", async () => {
    getCachedAudit.mockResolvedValue({ source: "cache" });
    getUserAuditById.mockResolvedValue(null);

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(404);
    expect(getUserAuditById).toHaveBeenCalledWith(7, "user_1");
  });

  it("returns the owned audit with the cached result", async () => {
    getCachedAudit.mockResolvedValue({ source: "cache" });
    getUserAuditById.mockResolvedValue(storedAudit());

    const response = await GET(request("GET"), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      fromCache: true,
      audit: { id: 7, domain: "example.com", result: { source: "cache" } },
    });
  });

  it("parses the database result when the cache misses", async () => {
    getUserAuditById.mockResolvedValue(storedAudit());

    const response = await GET(request("GET"), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fromCache).toBe(false);
    expect(body.audit.result).toEqual({ source: "database" });
  });

  it("returns null for an invalid stored result instead of failing the request", async () => {
    getUserAuditById.mockResolvedValue(storedAudit({ audit_result: "not-json" }));

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(200);
    expect((await response.json()).audit.result).toBeNull();
  });

  it("returns 404 when an owned audit cannot be deleted", async () => {
    deleteUserAudit.mockResolvedValue(false);

    const response = await DELETE(request("DELETE"), context());

    expect(response.status).toBe(404);
    expect(invalidateUserAuditCache).not.toHaveBeenCalled();
  });

  it("deletes within the user scope and invalidates the list cache", async () => {
    deleteUserAudit.mockResolvedValue(true);

    const response = await DELETE(request("DELETE"), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, message: "Audit borttagen." });
    expect(deleteUserAudit).toHaveBeenCalledWith(7, "user_1");
    expect(invalidateUserAuditCache).toHaveBeenCalledWith("user_1");
  });
});
