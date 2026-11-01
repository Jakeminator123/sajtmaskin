/**
 * API Route: Company Profile Management
 *
 * POST /api/company-profile - Save or update company profile
 * GET /api/company-profile?projectId=xxx - Get profile by project ID
 * GET /api/company-profile?search=xxx - Search profiles
 * GET /api/company-profile - Get all profiles
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { readRequestJsonWithLimit } from "@/lib/api/read-limited-body";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  CompanyProfileAccessDeniedError,
  CompanyProfileNotFoundError,
} from "@/lib/db/services/company-profile-errors";
import {
  getAllCompanyProfiles,
  getCompanyProfileByNameForOwner,
  getCompanyProfileByProjectId,
  linkCompanyProfileToProject,
  saveCompanyProfile,
  searchCompanyProfiles,
  type SaveCompanyProfileInput,
} from "@/lib/db/services/company-profiles";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";

const MAX_PROJECT_ID_CHARS = 256;
const MAX_COMPANY_NAME_CHARS = 500;
const MAX_PROFILE_TEXT_CHARS = 100_000;
const MAX_PROFILE_SEARCH_CHARS = 500;
const MAX_PROFILE_ID_CHARS = 20;
const MAX_PROFILE_BODY_BYTES = 8 * 1024 * 1024;

async function readObjectBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const result = await readRequestJsonWithLimit<unknown>(req, MAX_PROFILE_BODY_BYTES);
  const body = result.ok ? result.value : null;
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

const OPTIONAL_PROFILE_TEXT_FIELDS = [
  "industry",
  "location",
  "existing_website",
  "website_analysis",
  "site_likes",
  "site_dislikes",
  "site_feedback",
  "target_audience",
  "purposes",
  "special_wishes",
  "color_palette_name",
  "color_primary",
  "color_secondary",
  "color_accent",
  "competitor_insights",
  "industry_trends",
  "research_sources",
  "inspiration_sites",
  "voice_transcript",
] as const;

// GET - Retrieve company profiles
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const sessionId = getSessionIdFromRequest(req);
    if (!user && !sessionId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const scope = { userId: user?.id ?? null, sessionId };
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const companyName = searchParams.get("companyName");
    const search = searchParams.get("search");
    if (
      (projectId !== null && projectId.length > MAX_PROJECT_ID_CHARS) ||
      (companyName !== null && companyName.length > MAX_COMPANY_NAME_CHARS) ||
      (search !== null && search.length > MAX_PROFILE_SEARCH_CHARS)
    ) {
      return NextResponse.json({ success: false, error: "Query is too long" }, { status: 400 });
    }

    // Get by project ID — verify the caller owns the project
    if (projectId) {
      const project = await getProjectByIdForOwner(projectId, scope);
      if (!project) {
        return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
      }
      const profile = await getCompanyProfileByProjectId(projectId);
      if (!profile) {
        return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, profile });
    }

    // Get by company name
    if (companyName) {
      const profile = await getCompanyProfileByNameForOwner(companyName, scope);
      if (!profile) {
        return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, profile });
    }

    // Search profiles
    if (search) {
      const profiles = await searchCompanyProfiles(search, scope);
      return NextResponse.json({ success: true, profiles });
    }

    // Get all profiles
    const profiles = await getAllCompanyProfiles(scope);
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error("[API/company-profile] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve profiles" },
      { status: 500 },
    );
  }
}

// POST - Save or update company profile
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  const sessionId = getSessionIdFromRequest(req);
  if (!user && !sessionId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  console.info("[API/company-profile] Saving profile...");

  try {
    const rawBody = await readObjectBody(req);
    if (!rawBody) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }
    const project_id = rawBody.project_id;
    const company_name = rawBody.company_name;

    if (typeof company_name !== "string" || !company_name.trim()) {
      return NextResponse.json(
        { success: false, error: "Company name is required" },
        { status: 400 },
      );
    }

    if (company_name.length > MAX_COMPANY_NAME_CHARS) {
      return NextResponse.json(
        { success: false, error: "Company name is too long" },
        { status: 400 },
      );
    }

    if (
      typeof project_id !== "string" ||
      !project_id.trim() ||
      project_id.length > MAX_PROJECT_ID_CHARS
    ) {
      return NextResponse.json(
        { success: false, error: "project_id is required" },
        { status: 400 },
      );
    }
    if (
      OPTIONAL_PROFILE_TEXT_FIELDS.some(
        (field) =>
          rawBody[field] !== undefined &&
          rawBody[field] !== null &&
          (typeof rawBody[field] !== "string" ||
            (rawBody[field] as string).length > MAX_PROFILE_TEXT_CHARS),
      )
    ) {
      return NextResponse.json(
        { success: false, error: "Profile fields must be text" },
        { status: 400 },
      );
    }

    const scope = { userId: user?.id ?? null, sessionId };
    const normalizedProjectId = project_id.trim();

    const project = await getProjectByIdForOwner(normalizedProjectId, scope);
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Build profile object
    const profileData: SaveCompanyProfileInput = {
      project_id: normalizedProjectId,
      company_name: company_name.trim(),
      industry: optionalText(rawBody.industry),
      location: optionalText(rawBody.location),
      existing_website: optionalText(rawBody.existing_website),
      website_analysis: optionalText(rawBody.website_analysis),
      site_likes: optionalText(rawBody.site_likes),
      site_dislikes: optionalText(rawBody.site_dislikes),
      site_feedback: optionalText(rawBody.site_feedback),
      target_audience: optionalText(rawBody.target_audience),
      purposes: optionalText(rawBody.purposes),
      special_wishes: optionalText(rawBody.special_wishes),
      color_palette_name: optionalText(rawBody.color_palette_name),
      color_primary: optionalText(rawBody.color_primary),
      color_secondary: optionalText(rawBody.color_secondary),
      color_accent: optionalText(rawBody.color_accent),
      competitor_insights: optionalText(rawBody.competitor_insights),
      industry_trends: optionalText(rawBody.industry_trends),
      research_sources: optionalText(rawBody.research_sources),
      inspiration_sites: optionalText(rawBody.inspiration_sites),
      voice_transcript: optionalText(rawBody.voice_transcript),
    };

    const savedProfile = await saveCompanyProfile(profileData, scope);

    console.info("[API/company-profile] Saved profile ID:", savedProfile.id);

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch (error) {
    console.error("[API/company-profile] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to save profile" }, { status: 500 });
  }
}

// PATCH - Link profile to project
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  const sessionId = getSessionIdFromRequest(req);
  if (!user && !sessionId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await readObjectBody(req);
    const profileId = body?.profileId;
    const projectId = body?.projectId;
    const validProfileId =
      (typeof profileId === "number" && Number.isSafeInteger(profileId) && profileId > 0) ||
      (typeof profileId === "string" &&
        profileId.length <= MAX_PROFILE_ID_CHARS &&
        /^[1-9]\d*$/.test(profileId));

    if (
      !validProfileId ||
      typeof projectId !== "string" ||
      !projectId.trim() ||
      projectId.length > MAX_PROJECT_ID_CHARS
    ) {
      return NextResponse.json(
        { success: false, error: "profileId and projectId are required" },
        { status: 400 },
      );
    }

    const scope = { userId: user?.id ?? null, sessionId };
    const normalizedProjectId = projectId.trim();
    const project = await getProjectByIdForOwner(normalizedProjectId, scope);
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    await linkCompanyProfileToProject(profileId, normalizedProjectId, scope);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/company-profile] PATCH error:", error);
    if (error instanceof CompanyProfileNotFoundError) {
      return NextResponse.json({ success: false, error: "Profile not found" }, { status: 404 });
    }
    if (error instanceof CompanyProfileAccessDeniedError) {
      return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "Failed to link profile" }, { status: 500 });
  }
}
