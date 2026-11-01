import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  CompanyProfileAccessDeniedError,
  CompanyProfileNotFoundError,
} from "@/lib/db/services/company-profile-errors";

const getCurrentUser = vi.hoisted(() => vi.fn());
const getSessionIdFromRequest = vi.hoisted(() => vi.fn());
const getCompanyProfileByNameForOwner = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const searchCompanyProfiles = vi.hoisted(() => vi.fn());
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
  searchCompanyProfiles,
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

  it.each([
    `?projectId=${"p".repeat(257)}`,
    `?companyName=${"x".repeat(501)}`,
    `?search=${"x".repeat(501)}`,
  ])("rejects oversized lookup queries before database work: %s", async (query) => {
    const res = await GET(new NextRequest(`http://localhost/api/company-profile${query}`));

    expect(res.status).toBe(400);
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expect(getCompanyProfileByNameForOwner).not.toHaveBeenCalled();
    expect(searchCompanyProfiles).not.toHaveBeenCalled();
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

  it.each([
    "not-json",
    "null",
    "[]",
    '{"company_name":{}}',
    '{"company_name":"Acme","project_id":"proj_1","industry":{}}',
  ])("rejects malformed profile payload %s before project lookup", async (body) => {
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
    expect(saveCompanyProfile).not.toHaveBeenCalled();
  });

  it.each([
    { company_name: "x".repeat(501), project_id: "proj_1" },
    { company_name: "Acme", project_id: "p".repeat(257) },
    { company_name: "Acme", project_id: "proj_1", industry: "x".repeat(100_001) },
  ])("rejects oversized profile fields before project lookup", async (body) => {
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(getProjectByIdForOwner).not.toHaveBeenCalled();
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

  it.each([undefined, null])("preserves omitted fields and explicit null separately: %s", async (industry) => {
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_name: "Acme", project_id: "proj_1", industry }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const saved = saveCompanyProfile.mock.calls[0]?.[0];
    expect(saved.industry).toBe(industry);
    expect(saved.voice_transcript).toBeUndefined();
    expect(saved.website_analysis).toBeUndefined();
  });
});

describe("PATCH /api/company-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "user_1" });
    getSessionIdFromRequest.mockReturnValue("session_1");
    getProjectByIdForOwner.mockResolvedValue({ id: "proj_mine" });
  });

  it.each([
    "not-json",
    "null",
    "[]",
    '{"profileId":"1x","projectId":"proj_mine"}',
    '{"profileId":"123456789012345678901","projectId":"proj_mine"}',
  ])(
    "rejects malformed link payload %s before project lookup",
    async (body) => {
      const req = new NextRequest("http://localhost/api/company-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const res = await PATCH(req);

      expect(res.status).toBe(400);
      expect(getProjectByIdForOwner).not.toHaveBeenCalled();
      expect(linkCompanyProfileToProject).not.toHaveBeenCalled();
    },
  );

  it("does not claim an unattached profile", async () => {
    linkCompanyProfileToProject.mockRejectedValue(new CompanyProfileAccessDeniedError());
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: 1, projectId: "proj_mine" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: "Access denied" });
    expect(linkCompanyProfileToProject).toHaveBeenCalledWith(1, "proj_mine", {
      userId: "user_1",
      sessionId: "session_1",
    });
  });

  it("returns 404 for a missing profile without leaking internals", async () => {
    linkCompanyProfileToProject.mockRejectedValue(new CompanyProfileNotFoundError());
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: 99, projectId: "proj_mine" }),
    });

    const res = await PATCH(req);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Profile not found" });
  });

  it("returns a generic 500 for unexpected errors", async () => {
    linkCompanyProfileToProject.mockRejectedValue(
      new Error("relation company_profiles does not exist"),
    );
    const req = new NextRequest("http://localhost/api/company-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: 1, projectId: "proj_mine" }),
    });

    const res = await PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ success: false, error: "Failed to link profile" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});
