import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRateLimit } from "@/lib/rateLimit";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { createPromptHandoff } from "@/lib/db/services";
import { cachePromptHandoff } from "@/lib/data/redis";

const createPromptSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  source: z.string().optional(),
  projectId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return withRateLimit(request, "prompt:create", async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const validation = createPromptSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { success: false, error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { prompt, source, projectId } = validation.data;
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        return NextResponse.json({ success: false, error: "Prompt is required" }, { status: 400 });
      }

      const user = await getCurrentUser(request);
      const sessionId = getSessionIdFromRequest(request);

      const created = await createPromptHandoff({
        prompt: trimmedPrompt,
        source: source || null,
        projectId: projectId || null,
        userId: user?.id || null,
        sessionId: sessionId || null,
      });

      await cachePromptHandoff({
        id: created.id,
        prompt: created.prompt,
        source: created.source || null,
        projectId: created.project_id || null,
        createdAt: created.created_at ? String(created.created_at) : null,
      });

      return NextResponse.json({ success: true, promptId: created.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[API/prompts] Failed to create prompt handoff:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  });
}
