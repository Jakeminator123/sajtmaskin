import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getUserAuditCount = vi.hoisted(() => vi.fn());
const getUserAudits = vi.hoisted(() => vi.fn());
const saveUserAudit = vi.hoisted(() => vi.fn());
const getCachedUserAuditList = vi.hoisted(() => vi.fn());
const cacheUserAuditList = vi.hoisted(() => vi.fn());
const cacheAudit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/db/services/audits", () => ({
  getUserAuditCount,
  getUserAudits,
  saveUserAudit,
}));
vi.mock("@/lib/data/redis", () => ({
  getCachedUserAuditList,
  cacheUserAuditList,
  cacheAudit,
}));

const { GET, POST } = await import("./route");

function request(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/audits", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/audits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getCachedUserAuditList.mockResolvedValue(null);
  });

  it("requires authentication for list and save operations", async () => {
    getCurrentUser.mockResolvedValue(null);

    const listResponse = await GET(request("GET"));
    const saveResponse = await POST(
      request("POST", { url: "https://example.com", domain: "example.com", auditResult: {} }),
    );

    expect(listResponse.status).toBe(401);
    expect(saveResponse.status).toBe(401);
    expect(getUserAudits).not.toHaveBeenCalled();
    expect(saveUserAudit).not.toHaveBeenCalled();
  });

  it("returns the cached list without querying the database", async () => {
    const cached = [{ id: 1, domain: "example.com" }];
    getCachedUserAuditList.mockResolvedValue(cached);

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, audits: cached, fromCache: true });
    expect(getUserAudits).not.toHaveBeenCalled();
    expect(cacheUserAuditList).not.toHaveBeenCalled();
  });

  it("projects database rows to the lightweight list and caches it", async () => {
    const createdAt = new Date("2026-07-18T12:00:00.000Z");
    getUserAudits.mockResolvedValue([
      {
        id: 7,
        url: "https://example.com",
        domain: "example.com",
        company_name: "Example",
        score_overall: 81,
        score_seo: 82,
        score_ux: 83,
        score_performance: 84,
        score_security: 85,
        created_at: createdAt,
        audit_result: "ignored",
      },
    ]);

    const response = await GET(request("GET"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      fromCache: false,
      audits: [
        {
          id: 7,
          url: "https://example.com",
          domain: "example.com",
          company_name: "Example",
          score_overall: 81,
          score_seo: 82,
          score_ux: 83,
          score_performance: 84,
          score_security: 85,
          created_at: createdAt.toISOString(),
        },
      ],
    });
    expect(cacheUserAuditList).toHaveBeenCalledWith("user_1", body.audits);
  });

  it("rejects incomplete save payloads before checking the limit", async () => {
    const response = await POST(request("POST", { url: "https://example.com" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, error: "Saknar nödvändig data." });
    expect(getUserAuditCount).not.toHaveBeenCalled();
  });

  it("enforces the per-user saved audit limit", async () => {
    getUserAuditCount.mockResolvedValue(50);

    const response = await POST(
      request("POST", {
        url: "https://example.com",
        domain: "example.com",
        auditResult: { audit_scores: { seo: 80 } },
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("maxgränsen på 50");
    expect(saveUserAudit).not.toHaveBeenCalled();
  });

  it("saves and caches an owned audit", async () => {
    const auditResult = { audit_scores: { seo: 80 } };
    const createdAt = new Date("2026-07-18T12:00:00.000Z");
    getUserAuditCount.mockResolvedValue(2);
    saveUserAudit.mockResolvedValue({
      id: 9,
      domain: "example.com",
      company_name: "Example",
      score_overall: 80,
      created_at: createdAt,
    });

    const response = await POST(
      request("POST", {
        url: "https://example.com",
        domain: "example.com",
        auditResult,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveUserAudit).toHaveBeenCalledWith(
      "user_1",
      "https://example.com",
      "example.com",
      auditResult,
    );
    expect(cacheAudit).toHaveBeenCalledWith(9, "user_1", auditResult);
    expect(body).toMatchObject({
      success: true,
      audit: { id: 9, domain: "example.com", company_name: "Example", score_overall: 80 },
    });
  });
});
