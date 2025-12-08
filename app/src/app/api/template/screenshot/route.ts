import { NextRequest, NextResponse } from "next/server";
import {
  getTemplateScreenshot,
  saveTemplateScreenshot,
  getAllTemplateScreenshots,
} from "@/lib/database";

/**
 * GET /api/template/screenshot?id=<templateId>
 *
 * Returns cached screenshot URL for a template.
 * If no id is provided, returns all cached screenshots.
 *
 * Response:
 * {
 *   success: true,
 *   screenshot_url: string | null,
 *   cached: boolean
 * }
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const templateId = searchParams.get("id");

  // If no id, return all cached screenshots
  if (!templateId) {
    try {
      const screenshots = getAllTemplateScreenshots();
      const screenshotMap: Record<string, string> = {};
      for (const s of screenshots) {
        screenshotMap[s.template_id] = s.screenshot_url;
      }
      return NextResponse.json({
        success: true,
        screenshots: screenshotMap,
      });
    } catch (error) {
      console.error("[API /template/screenshot] Error fetching all:", error);
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      );
    }
  }

  try {
    const cached = getTemplateScreenshot(templateId);

    if (cached) {
      return NextResponse.json({
        success: true,
        template_id: templateId,
        screenshot_url: cached.screenshot_url,
        cached: true,
        created_at: cached.created_at,
      });
    }

    // Not cached
    return NextResponse.json({
      success: true,
      template_id: templateId,
      screenshot_url: null,
      cached: false,
    });
  } catch (error) {
    console.error("[API /template/screenshot] Error:", error);
    return NextResponse.json(
      { success: false, error: "Database error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/template/screenshot
 *
 * Saves a screenshot URL for a template.
 *
 * Body:
 * {
 *   template_id: string,
 *   screenshot_url: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template_id, screenshot_url } = body;

    if (!template_id || !screenshot_url) {
      return NextResponse.json(
        { success: false, error: "Missing template_id or screenshot_url" },
        { status: 400 }
      );
    }

    const saved = saveTemplateScreenshot(template_id, screenshot_url);

    return NextResponse.json({
      success: true,
      template_id: saved.template_id,
      screenshot_url: saved.screenshot_url,
      created_at: saved.created_at,
    });
  } catch (error) {
    console.error("[API /template/screenshot] POST Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save screenshot" },
      { status: 500 }
    );
  }
}

