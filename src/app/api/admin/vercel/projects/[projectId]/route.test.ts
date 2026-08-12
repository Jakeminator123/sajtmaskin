import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminAccess = vi.hoisted(() => vi.fn());
const deleteProject = vi.hoisted(() => vi.fn());
const isVercelConfigured = vi.hoisted(() => vi.fn());
const existsSync = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAccess }));
vi.mock("@/lib/vercel/vercel-client", () => ({ deleteProject, isVercelConfigured }));
vi.mock("node:fs", () => ({
  default: { existsSync, readFileSync },
  existsSync,
  readFileSync,
}));

const { DELETE } = await import("./route");

const ORIGINAL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

function deleteRequest(projectId: string) {
  const request = new Request(`http://localhost/api/admin/vercel/projects/${projectId}`, {
    method: "DELETE",
  });
  // The route reads `req.nextUrl.searchParams`; a plain Request has no nextUrl.
  Object.defineProperty(request, "nextUrl", {
    value: new URL(request.url),
    configurable: true,
  });
  return request as never;
}

function ctx(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAccess.mockResolvedValue({ ok: true, user: { email: "admin@example.com" } });
  isVercelConfigured.mockReturnValue(true);
  deleteProject.mockResolvedValue(undefined);
  existsSync.mockReturnValue(false);
  process.env.VERCEL_PROJECT_ID = "prj_sajtmaskin_self";
});

afterEach(() => {
  if (ORIGINAL_PROJECT_ID === undefined) {
    delete process.env.VERCEL_PROJECT_ID;
  } else {
    process.env.VERCEL_PROJECT_ID = ORIGINAL_PROJECT_ID;
  }
});

describe("DELETE /api/admin/vercel/projects/[projectId]", () => {
  it("refuses to delete Sajtmaskin's own Vercel project", async () => {
    const response = await DELETE(deleteRequest("prj_sajtmaskin_self"), ctx("prj_sajtmaskin_self"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/eget Vercel-projekt/i);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("deletes a customer project", async () => {
    const response = await DELETE(deleteRequest("prj_customer"), ctx("prj_customer"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(deleteProject).toHaveBeenCalledWith("prj_customer", undefined);
  });

  it("requires admin access before doing anything", async () => {
    requireAdminAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
      }),
    });

    const response = await DELETE(deleteRequest("prj_customer"), ctx("prj_customer"));

    expect(response.status).toBe(401);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("stays fail-closed when Vercel is not configured", async () => {
    isVercelConfigured.mockReturnValue(false);

    const response = await DELETE(deleteRequest("prj_customer"), ctx("prj_customer"));

    expect(response.status).toBe(503);
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("refuses every delete while the app's own project id is unknown", async () => {
    // Codex P1 on #611: with a token but no VERCEL_PROJECT_ID, the guard used to
    // classify every project as "not self" — so production was deletable.
    delete process.env.VERCEL_PROJECT_ID;

    const response = await DELETE(deleteRequest("prj_customer"), ctx("prj_customer"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe("unknown-self");
    expect(body.error).toMatch(/VERCEL_PROJECT_ID/);
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
