import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getCompanyProfileByNameForOwner = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const saveCompanyProfile = vi.hoisted(() => vi.fn());
const linkCompanyProfileToProject = vi.hoisted(() => vi.fn());

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
  linkCompanyProfileToProject,
  saveCompanyProfile,
  searchCompanyProfiles: vi.fn(),
}));

vi.mock("@/lib/db/services/projects", () => ({
  getProjectByIdForOwner,
}));

const { GET, POST, PATCH } = await import("./route");

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

describe("POST /api/company-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("session_1");
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_1" });
    saveCompanyProfile.mockResolvedValue({ id: 9, company_name: "Acme", project_id: "proj_1" });
  });

  it("rejects a profile without a project_id", async () => {
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: "Acme", voice_transcript: "hemligt" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(saveCompanyProfile).not.toHaveBeenCalled();
  });

  it("saves when the caller owns the project", async () => {
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: "Acme", project_id: "proj_1" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(saveCompanyProfile).toHaveBeenCalled();
  });
});

describe("PATCH /api/company-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("session_1");
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_mine" });
  });

  it("does not claim an unattached profile", async () => {
    linkCompanyProfileToProject.mockRejectedValue(new Error("Profile not found or access denied"));
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: 1, projectId: "proj_mine" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(linkCompanyProfileToProject).toHaveBeenCalledWith(1, "proj_mine", {
      userId: "user_1",
      sessionId: "session_1",
    });
  });
});
