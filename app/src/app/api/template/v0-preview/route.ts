import { NextRequest, NextResponse } from "next/server";
import { initTemplatePreview } from "@/lib/v0-generator";

// Allow 5 minutes for preview initialization
export const maxDuration = 300;

/**
 * GET /api/template/v0-preview?id=<v0TemplateId>
 *
 * Returns preview data for a v0 template directly (without local template lookup).
 * Used for gallery preview of v0 templates.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const v0TemplateId = searchParams.get("id");

  if (!v0TemplateId) {
    return NextResponse.json(
      { success: false, error: "Missing template id parameter" },
      { status: 400 }
    );
  }

  try {
    console.log("[API /template/v0-preview] Fetching preview for:", v0TemplateId);
    const preview = await initTemplatePreview(v0TemplateId);

    return NextResponse.json({
      success: true,
      v0TemplateId,
      chatId: preview.chatId,
      demoUrl: preview.demoUrl,
      screenshotUrl: preview.screenshotUrl,
    });
  } catch (error) {
    console.error("[API /template/v0-preview] Error:", error);

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

