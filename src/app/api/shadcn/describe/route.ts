import { NextResponse } from "next/server";
import { z } from "zod";
import { requireNotBot } from "@/lib/botProtection";
import { withRateLimit } from "@/lib/rateLimit";
import { getRequestUserId } from "@/lib/tenant";
import { errorLog } from "@/lib/utils/debug";
import { isShadcnDescribeEnabled } from "@/lib/shadcn/describe-feature";
import { describeComponents } from "@/lib/shadcn/describe";

export const runtime = "nodejs";
export const maxDuration = 60;

const describeRequestSchema = z.object({
  description: z.string().trim().min(1, "description is required").max(2_000),
  limit: z.number().int().min(1).max(10).optional(),
  style: z.string().trim().max(60).optional(),
});

/**
 * Fas 1 "Beskriv"-discovery. Translates a free-text description into shadcn
 * registry search queries, searches the official + community registries and
 * ranks the real matches. WRITES NOTHING to the user site.
 *
 * Flag-gated behind `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`: when off, the
 * route returns 404 and no discovery code runs (zero behavior change).
 */
export async function POST(req: Request) {
  if (!isShadcnDescribeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return withRateLimit(req, "shadcn:describe", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      // Same posture as `/api/ai/brief`: this route spends paid provider keys,
      // so anonymous/guest sessions must not be able to consume it.
      const userId = await getRequestUserId(req);
      if (!userId || userId.startsWith("guest:")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }

      const body = await req.json().catch(() => null);
      const parsed = describeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 400 },
        );
      }

      const { description, limit, style } = parsed.data;
      const result = await describeComponents({ description, limit, style });

      return NextResponse.json(result, {
        headers: {
          "Cache-Control": "no-store",
          "X-Describe-Ranking": result.ranking,
          "X-Describe-Fallback-Queries": String(result.usedFallbackQueries),
        },
      });
    } catch (err) {
      errorLog("shadcn-describe", "describe route error", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
