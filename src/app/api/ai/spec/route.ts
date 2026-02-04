import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { processPromptWithSpec } from "@/lib/builder/promptAssistContext";

export const runtime = "nodejs";
export const maxDuration = 60;

const specRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(10000, "Prompt too long"),
});

/**
 * POST /api/ai/spec
 *
 * Generate a structured website spec from a user prompt using the spec-first chain.
 * This uses v0-1.5-lg via AI Gateway to analyze the prompt and create a detailed
 * specification that can be used for higher quality code generation.
 *
 * Request body:
 * - prompt: string - The user's website request
 *
 * Response:
 * - spec: WebsiteSpec - The generated structured specification
 * - enhancedPrompt: string - A formatted prompt for v0 Platform API
 */
export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };

  return withRateLimit(req, "ai:spec", async () => {
    try {
      const body = await req.json().catch(() => ({}));

      const validationResult = specRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const { prompt } = validationResult.data;

      // Generate spec using the spec-first chain
      const result = await processPromptWithSpec(prompt);

      return attachSessionCookie(
        NextResponse.json({
          success: true,
          spec: result.spec,
          enhancedPrompt: result.enhancedPrompt,
        }),
      );
    } catch (err) {
      console.error("Spec generation error:", err);
      return attachSessionCookie(
        NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to generate spec" },
          { status: 500 },
        ),
      );
    }
  });
}
