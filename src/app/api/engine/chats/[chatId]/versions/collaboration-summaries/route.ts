import { NextResponse } from "next/server";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { getApprovalStatus, getUnresolvedCommentCount } from "@/lib/db/services/collaboration";

type RouteParams = {
  params: Promise<{ chatId: string }>;
};

const MAX_SUMMARY_VERSIONS = 100;
const MAX_SUMMARY_ID_CHARS = 128;

export async function GET(
  request: Request,
  ctx: RouteParams,
) {
  try {
    const { chatId } = await ctx.params;
    if (!chatId || chatId.length > MAX_SUMMARY_ID_CHARS) {
      return NextResponse.json({ error: "Invalid chat ID" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const versionIdsParam = searchParams.get("versionIds");
    const parsedVersionIds = versionIdsParam
      ? versionIdsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    if (parsedVersionIds.some((id) => id.length > MAX_SUMMARY_ID_CHARS)) {
      return NextResponse.json({ error: "Invalid version ID" }, { status: 400 });
    }
    const versionIds = [...new Set(parsedVersionIds)];
    if (versionIds.length === 0) {
      return NextResponse.json({ summaries: {} });
    }
    if (versionIds.length > MAX_SUMMARY_VERSIONS) {
      return NextResponse.json({ error: "Too many version IDs" }, { status: 400 });
    }

    const engineChat = await getEngineChatByIdForRequest(request, chatId);
    if (!engineChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const summaries: Record<string, { approvalStatus: string | null; unresolvedCount: number }> = {};
    await Promise.all(
      versionIds.map(async (vid) => {
        const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, vid);
        if (!scopedVersion) return;
        const internalVersionId = scopedVersion.version.id;
        const [approval, unresolvedCount] = await Promise.all([
          getApprovalStatus(internalVersionId),
          getUnresolvedCommentCount(internalVersionId),
        ]);
        summaries[vid] = {
          approvalStatus: approval?.status ?? null,
          unresolvedCount,
        };
      }),
    );
    return NextResponse.json({ summaries });
  } catch (error) {
    console.error("[API] Failed to get collaboration summaries:", error);
    return NextResponse.json({ error: "Failed to get collaboration summaries" }, { status: 500 });
  }
}
