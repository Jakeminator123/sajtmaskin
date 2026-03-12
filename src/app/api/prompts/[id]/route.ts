import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { deletePromptHandoffCache, getCachedPromptHandoff } from "@/lib/data/redis";
import { consumePromptHandoffForOwner, getPromptHandoffByIdForOwner } from "@/lib/db/services";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function normalizeId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function canUseCachedPrompt(
  cached: Awaited<ReturnType<typeof getCachedPromptHandoff>>,
  owner: { userId: string | null; sessionId: string | null },
) {
  if (!cached) return false;
  const cachedUserId = normalizeId(cached.userId);
  const cachedSessionId = normalizeId(cached.sessionId);

  if (owner.userId && cachedUserId && owner.userId === cachedUserId) {
    return true;
  }

  if (!cachedUserId && owner.sessionId && cachedSessionId && owner.sessionId === cachedSessionId) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return withRateLimit(request, "prompt:consume", async () => {
    const { id } = await params;
    const promptId = id?.trim();
    if (!promptId) {
      return NextResponse.json({ success: false, error: "promptId is required" }, { status: 400 });
    }

    const user = await getCurrentUser(request).catch(() => null);
    const ownerScope = {
      userId: user?.id ?? null,
      sessionId: getSessionIdFromRequest(request),
    };
    if (!ownerScope.userId && !ownerScope.sessionId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const cached = await getCachedPromptHandoff(promptId);
    const cachedPrompt = canUseCachedPrompt(cached, ownerScope) ? cached!.prompt : null;
    const consumed = await consumePromptHandoffForOwner(promptId, ownerScope);
    if (!consumed) {
      const existing = await getPromptHandoffByIdForOwner(promptId, ownerScope);
      if (!existing) {
        await deletePromptHandoffCache(promptId);
        console.warn("[API/prompts] Prompt handoff not found:", promptId);
        return NextResponse.json({ success: false, error: "Prompt not found" }, { status: 404 });
      }

      await deletePromptHandoffCache(promptId);

      return NextResponse.json({
        success: true,
        prompt: cachedPrompt ?? existing.prompt,
        source: existing.source || null,
        projectId: existing.project_id || null,
        consumedAt: existing.consumed_at ? String(existing.consumed_at) : null,
        alreadyConsumed: Boolean(existing.consumed_at),
      });
    }

    await deletePromptHandoffCache(promptId);

    return NextResponse.json({
      success: true,
      prompt: cachedPrompt ?? consumed.prompt,
      source: consumed.source || null,
      projectId: consumed.project_id || null,
      consumedAt: consumed.consumed_at ? String(consumed.consumed_at) : null,
      alreadyConsumed: false,
    });
  });
}
