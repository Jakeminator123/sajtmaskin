import { getLocalTemplateById } from "@/lib/local-templates";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/local-template?id=xxx
 * Returns metadata for a local template (which maps to a v0 template)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const templateId = searchParams.get("id");

  if (!templateId) {
    return NextResponse.json(
      { success: false, error: "Template ID is required" },
      { status: 400 }
    );
  }

  const template = getLocalTemplateById(templateId);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404 }
    );
  }

  if (!template.v0TemplateId) {
    console.error(
      "[local-template] Template missing v0TemplateId:",
      template.id
    );
    return NextResponse.json(
      {
        success: false,
        error: "Template configuration error: missing v0TemplateId",
      },
      { status: 400 } // Client/config error, not server error
    );
  }

  return NextResponse.json({
    success: true,
    template,
  });
}
