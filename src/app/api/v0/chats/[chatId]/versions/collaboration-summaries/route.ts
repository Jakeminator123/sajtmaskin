import { NextResponse } from "next/server";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { getApprovalStatus, getUnresolvedCommentCount } from "@/lib/db/services";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";

type RouteParams = {
  params: Promise<{ chatId: string }>;
};

export async function GET(
  request: Request,
  ctx: RouteParams,
) {
  try {
    if (shouldUseV0Fallback()) {
      return NextResponse.json({ summaries: {} });
    }
    const { chatId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const versionIdsParam = searchParams.get("versionIds");
    const versionIds = versionIdsParam ? versionIdsParam.split(",").map((id) => id.trim()).filter(Boolean) : [];
    if (versionIds.length === 0) {
      return NextResponse.json({ summaries: {} });
    }

    const engineChat = await getEngineChatByIdForRequest(request, chatId);
    if (!engineChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const summaries: Record<string, { approvalStatus: string | null; unresolvedCount: number }> = {};
    await Promise.all(
      versionIds.map(async (vid) => {
        const approval = await getApprovalStatus(vid);
        const unresolvedCount = await getUnresolvedCommentCount(vid);
        summaries[vid] = {
          approvalStatus: approval?.status ?? null,
          unresolvedCount,
        };
      }),
    );
    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("[API] Failed to get collaboration summaries:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
