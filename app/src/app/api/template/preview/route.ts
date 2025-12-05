import { NextRequest, NextResponse } from "next/server";
import { getLocalTemplateById } from "@/lib/local-templates";
import { initTemplatePreview } from "@/lib/v0-generator";
import { getCachedPreview, setCachedPreview } from "@/lib/preview-cache";
import { saveTemplateScreenshot } from "@/lib/database";

// Allow 5 minutes for preview initialization (complex v0 generation)
export const maxDuration = 300;

/**
 * GET /api/template/preview?id=<localTemplateId>
 *
 * Returns preview data for a template WITHOUT selecting it.
 * Used for gallery preview before user commits to using a template.
 *
 * Response:
 * {
 *   success: true,
 *   templateId: string,
 *   chatId: string,
 *   demoUrl: string | null,
 *   screenshotUrl: string | null,
 *   cached: boolean
 * }
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const templateId = searchParams.get("id");

  if (!templateId) {
    return NextResponse.json(
      { success: false, error: "Missing template id parameter" },
      { status: 400 }
    );
  }

  // Find the local template
  const template = getLocalTemplateById(templateId);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404 }
    );
  }

  // TYP B templates (no v0TemplateId) cannot use this endpoint
  if (!template.v0TemplateId) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Template has no v0TemplateId (TYP B templates not supported for preview)",
      },
      { status: 400 }
    );
  }

  try {
    // Check cache first (Redis with in-memory fallback)
    const cached = await getCachedPreview(templateId);
    if (cached) {
      return NextResponse.json({
        success: true,
        templateId: template.id,
        templateName: template.name,
        chatId: cached.chatId,
        demoUrl: cached.demoUrl,
        screenshotUrl: cached.screenshotUrl,
        cached: true,
      });
    }

    // Not cached - call v0 API
    console.log("[API /template/preview] Fetching preview for:", templateId);
    const preview = await initTemplatePreview(template.v0TemplateId);

    // Cache the result (Redis with in-memory fallback)
    await setCachedPreview(templateId, preview);

    // Auto-save screenshot to SQLite database for persistent caching
    if (preview.screenshotUrl) {
      try {
        saveTemplateScreenshot(templateId, preview.screenshotUrl);
        console.log(
          "[API /template/preview] Saved screenshot to DB for:",
          templateId
        );
      } catch (dbError) {
        console.error(
          "[API /template/preview] Failed to save screenshot to DB:",
          dbError
        );
        // Continue anyway - this is not critical
      }
    }

    return NextResponse.json({
      success: true,
      templateId: template.id,
      templateName: template.name,
      chatId: preview.chatId,
      demoUrl: preview.demoUrl,
      screenshotUrl: preview.screenshotUrl,
      cached: false,
    });
  } catch (error) {
    console.error("[API /template/preview] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return NextResponse.json(
        { success: false, error: "Template not found on v0" },
        { status: 404 }
      );
    }

    if (
      errorMessage.includes("rate limit") ||
      errorMessage.includes("Rate limit")
    ) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Try again later." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to load preview" },
      { status: 500 }
    );
  }
}
