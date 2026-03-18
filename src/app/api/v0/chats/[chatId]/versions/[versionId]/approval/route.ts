import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  requestApproval,
  submitApproval,
  getApprovalStatus,
} from "@/lib/db/services";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type ApprovalAction = "request" | "approve" | "reject" | "changes_requested";

export async function GET(_request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(_request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const approval = await getApprovalStatus(scopedVersion.version.id);
    return NextResponse.json({ approval: approval ?? null });
  } catch (error) {
    console.error("[API] Failed to get approval status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const scopedVersion = await getEngineVersionForChatByIdForRequest(request, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    const body = (await request.json().catch(() => null)) as { action?: string; comment?: string } | null;
    const action = body?.action as ApprovalAction | undefined;
    if (!action || !["request", "approve", "reject", "changes_requested"].includes(action)) {
      return NextResponse.json({ error: "Missing or invalid action" }, { status: 400 });
    }
    const comment = typeof body?.comment === "string" ? body.comment.trim() || undefined : undefined;

    if (action === "request") {
      const approval = await requestApproval(scopedVersion.version.id, scopedVersion.chat.id);
      return NextResponse.json({ approval });
    }

    const approval = await getApprovalStatus(scopedVersion.version.id);
    if (!approval) {
      return NextResponse.json({ error: "No approval request found for this version" }, { status: 404 });
    }
    const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested";
    const updated = await submitApproval(approval.id, status, comment);
    return NextResponse.json({ approval: updated });
  } catch (error) {
    console.error("[API] Failed to submit approval:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
