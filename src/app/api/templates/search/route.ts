import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { searchTemplates } from "@/lib/templates/template-search";

export async function POST(req: Request) {
  return withRateLimit(req, "default", async () => {
    try {
      const body = await req.json().catch(() => null);

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.query !== "string" ||
        !body.query.trim()
      ) {
        return NextResponse.json(
          { success: false, error: "Missing or empty 'query' field" },
          { status: 400 },
        );
      }
      if (
        body.topK !== undefined &&
        (typeof body.topK !== "number" || !Number.isFinite(body.topK))
      ) {
        return NextResponse.json(
          { success: false, error: "Invalid 'topK' field" },
          { status: 400 },
        );
      }

      const query = body.query.trim().slice(0, 500);
      const topK = Math.min(Math.max(Math.floor(body.topK ?? 5), 1), 20);

      const results = await searchTemplates(query, topK);

      return NextResponse.json({ success: true, results });
    } catch (err) {
      console.error("[api/templates/search] Error:", err);
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  });
}
