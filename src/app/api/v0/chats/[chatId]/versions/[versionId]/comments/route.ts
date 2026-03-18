import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { createComment, getCommentsForVersion, resolveComment } from "@/lib/db/services";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

export async function GET(_request: Request, ctx: RouteParams) {
  try {
    if (shouldUseV0Fallback()) {
      return NextResponse.json({ error: "Collaboration not available in v0 fallback mode" }, { status: 400 });
    }
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(_request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const comments = await getCommentsForVersion(scopedVersion.version.id);
    return NextResponse.json({ comments });
  } catch (error) {
    console.error("[API] Failed to list comments:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    if (shouldUseV0Fallback()) {
      return NextResponse.json({ error: "Collaboration not available in v0 fallback mode" }, { status: 400 });
    }
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as { content?: string; authorName?: string } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }
    const comment = await createComment({
      versionId: scopedVersion.version.id,
      chatId: scopedVersion.chat.id,
      content,
      authorName: typeof body?.authorName === "string" ? body.authorName.trim() || undefined : undefined,
    });
    return NextResponse.json({ comment });
  } catch (error) {
    console.error("[API] Failed to create comment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: RouteParams) {
  try {
    if (shouldUseV0Fallback()) {
      return NextResponse.json({ error: "Collaboration not available in v0 fallback mode" }, { status: 400 });
    }
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as { commentId?: string } | null;
    const commentId = typeof body?.commentId === "string" ? body.commentId.trim() : "";
    if (!commentId) {
      return NextResponse.json({ error: "Missing commentId" }, { status: 400 });
    }
    const updated = await resolveComment(commentId);
    if (!updated) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    return NextResponse.json({ comment: updated });
  } catch (error) {
    console.error("[API] Failed to resolve comment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
