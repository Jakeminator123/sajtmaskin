import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  acceptRepair,
  getLatestVersion,
} from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { previewUrlField } from "@/lib/api/preview-url-contract";

const requestSchema = z.object({
  versionId: z.string().min(1),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId } = validation.data;
    const scoped = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scoped) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const latest = await getLatestVersion(scoped.chat.id).catch(() => null);
    if (latest && latest.id !== scoped.version.id) {
      return NextResponse.json(
        { error: "A newer version exists. Accept repair on the latest version instead." },
        { status: 409 },
      );
    }

    const accepted = await acceptRepair(
      scoped.version.id,
      "Server repair accepted and applied.",
    );
    if (!accepted) {
      return NextResponse.json(
        { error: "No pending server repair found for this version." },
        { status: 409 },
      );
    }

    await createEngineVersionErrorLogs([
      {
        chatId,
        versionId: accepted.id,
        level: "info",
        category: "server-repair:accepted",
        message: "User accepted pending server repair.",
        meta: {
          acceptedAt: new Date().toISOString(),
          serverOwned: false,
        },
      },
    ]).catch(() => null);

    return NextResponse.json({
      success: true,
      versionId: accepted.id,
      ...previewUrlField(accepted.preview_url),
      releaseState: accepted.release_state,
      verificationState: accepted.verification_state,
      verificationSummary: accepted.verification_summary,
      promotedAt: accepted.promoted_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accept repair failed" },
      { status: 500 },
    );
  }
}
