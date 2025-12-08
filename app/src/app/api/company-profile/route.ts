/**
 * API Route: Company Profile Management
 *
 * POST /api/company-profile - Save or update company profile
 * GET /api/company-profile?projectId=xxx - Get profile by project ID
 * GET /api/company-profile?search=xxx - Search profiles
 * GET /api/company-profile - Get all profiles
 */

import { NextRequest, NextResponse } from "next/server";
import {
  saveCompanyProfile,
  getCompanyProfileByProjectId,
  getCompanyProfileByName,
  getAllCompanyProfiles,
  searchCompanyProfiles,
  linkCompanyProfileToProject,
  type CompanyProfile,
} from "@/lib/database";

// GET - Retrieve company profiles
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const companyName = searchParams.get("companyName");
    const search = searchParams.get("search");

    // Get by project ID
    if (projectId) {
      const profile = getCompanyProfileByProjectId(projectId);
      if (!profile) {
        return NextResponse.json(
          { success: false, error: "Profile not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, profile });
    }

    // Get by company name
    if (companyName) {
      const profile = getCompanyProfileByName(companyName);
      if (!profile) {
        return NextResponse.json(
          { success: false, error: "Profile not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, profile });
    }

    // Search profiles
    if (search) {
      const profiles = searchCompanyProfiles(search);
      return NextResponse.json({ success: true, profiles });
    }

    // Get all profiles
    const profiles = getAllCompanyProfiles();
    return NextResponse.json({ success: true, profiles });
  } catch (error) {
    console.error("[API/company-profile] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve profiles" },
      { status: 500 }
    );
  }
}

// POST - Save or update company profile
export async function POST(req: NextRequest) {
  console.log("[API/company-profile] Saving profile...");

  try {
    const body = await req.json();

    const {
      project_id,
      company_name,
      industry,
      location,
      existing_website,
      website_analysis,
      site_likes,
      site_dislikes,
      site_feedback,
      target_audience,
      purposes,
      special_wishes,
      color_palette_name,
      color_primary,
      color_secondary,
      color_accent,
      competitor_insights,
      industry_trends,
      research_sources,
      inspiration_sites,
      voice_transcript,
    } = body;

    if (!company_name) {
      return NextResponse.json(
        { success: false, error: "Company name is required" },
        { status: 400 }
      );
    }

    // Build profile object
    const profileData: Omit<
      CompanyProfile,
      "id" | "created_at" | "updated_at"
    > = {
      project_id,
      company_name,
      industry,
      location,
      existing_website,
      website_analysis,
      site_likes,
      site_dislikes,
      site_feedback,
      target_audience,
      purposes,
      special_wishes,
      color_palette_name,
      color_primary,
      color_secondary,
      color_accent,
      competitor_insights,
      industry_trends,
      research_sources,
      inspiration_sites,
      voice_transcript,
    };

    const savedProfile = saveCompanyProfile(profileData);

    console.log("[API/company-profile] Saved profile ID:", savedProfile.id);

    return NextResponse.json({
      success: true,
      profile: savedProfile,
    });
  } catch (error) {
    console.error("[API/company-profile] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save profile" },
      { status: 500 }
    );
  }
}

// PATCH - Link profile to project
export async function PATCH(req: NextRequest) {
  try {
    const { profileId, projectId } = await req.json();

    if (!profileId || !projectId) {
      return NextResponse.json(
        { success: false, error: "profileId and projectId are required" },
        { status: 400 }
      );
    }

    linkCompanyProfileToProject(profileId, projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API/company-profile] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to link profile" },
      { status: 500 }
    );
  }
}
