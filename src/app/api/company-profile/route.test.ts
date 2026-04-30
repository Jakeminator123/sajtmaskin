import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getCompanyProfileByNameForOwner = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionIdFromRequest,
}));

vi.mock("@/lib/db/services/company-profiles", () => ({
  getAllCompanyProfiles: vi.fn(),
  getCompanyProfileByNameForOwner,
  getCompanyProfileByProjectId: vi.fn(),
  linkCompanyProfileToProject: vi.fn(),
  saveCompanyProfile: vi.fn(),
  searchCompanyProfiles: vi.fn(),
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner: vi.fn(),
}));

const { GET } = await import("./route");

describe("GET /api/company-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("session_1");
  });

  it("scopes companyName lookup to the current owner/session", async () => {
    getCompanyProfileByNameForOwner.mockResolvedValue({
      id: 1,
      company_name: "Acme",
      project_id: "proj_1",
    });
    const req = new NextRequest("http://localhost/api/company-profile?companyName=Acme");

    const res = await GET(req);
    const json = await res.json();

    expect(getCompanyProfileByNameForOwner).toHaveBeenCalledWith("Acme", {
      userId: "user_1",
      sessionId: "session_1",
    });
    expect(res.status).toBe(200);
    expect(json.profile.company_name).toBe("Acme");
  });

  it("returns 404 when the company name exists outside the caller scope", async () => {
    getCompanyProfileByNameForOwner.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/company-profile?companyName=Acme");

    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});
