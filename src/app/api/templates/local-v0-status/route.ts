import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { getAvailableLocalV0TemplateIds } from "@/lib/templates/local-v0-template-source";

const MAX_TEMPLATE_IDS = 200;

export async function POST(req: Request) {
  return withRateLimit(req, "default", async () => {
    try {
      const body = await req.json().catch(() => null);
      const ids = Array.isArray(body?.ids)
        ? body.ids
            .map((value: unknown) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
            .slice(0, MAX_TEMPLATE_IDS)
        : [];

      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "Missing or empty 'ids' field" },
          { status: 400 },
        );
      }

      const availableIds = [...(await getAvailableLocalV0TemplateIds(ids))].sort((a, b) =>
        a.localeCompare(b),
      );

      return NextResponse.json({ success: true, availableIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      console.error("[api/templates/local-v0-status] Error:", message);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  });
}
