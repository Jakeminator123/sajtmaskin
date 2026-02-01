import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { deletePromptHandoffCache, getCachedPromptHandoff } from "@/lib/data/redis";
import { consumePromptHandoff } from "@/lib/db/services";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withRateLimit(request, "prompt:consume", async () => {
    const { id } = await params;
    const promptId = id?.trim();
    if (!promptId) {
      return NextResponse.json({ success: false, error: "promptId is required" }, { status: 400 });
    }

    const cached = await getCachedPromptHandoff(promptId);
    const consumed = await consumePromptHandoff(promptId);
    if (!consumed) {
      await deletePromptHandoffCache(promptId);
      console.warn("[API/prompts] Prompt handoff not found or already consumed:", promptId);
      return NextResponse.json(
        { success: false, error: "Prompt not found or already consumed" },
        { status: 404 },
      );
    }

    await deletePromptHandoffCache(promptId);

    return NextResponse.json({
      success: true,
      prompt: cached?.prompt ?? consumed.prompt,
      source: consumed.source || null,
      projectId: consumed.project_id || null,
      consumedAt: consumed.consumed_at ? String(consumed.consumed_at) : null,
    });
  });
}
