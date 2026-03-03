import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { searchTemplates } from "@/lib/templates/template-search";

export async function POST(req: Request) {
  return withRateLimit(req, "default", async () => {
    try {
      const body = await req.json().catch(() => null);

      if (!body || typeof body.query !== "string" || !body.query.trim()) {
        return NextResponse.json(
          { success: false, error: "Missing or empty 'query' field" },
          { status: 400 },
        );
      }

      const query = body.query.trim().slice(0, 500);
      const topK = Math.min(Math.max(Number(body.topK) || 5, 1), 20);

      const results = await searchTemplates(query, topK);

      return NextResponse.json({ success: true, results });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      console.error("[api/templates/search] Error:", message);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  });
}
