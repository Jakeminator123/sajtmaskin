import { NextResponse } from "next/server";
import { z } from "zod";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import {
  acceptRepair,
  getLatestVersion,
  hasActiveVersionLease,
} from "@/lib/db/chat-repository-pg";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { previewUrlField } from "@/lib/api/preview-url-contract";

const requestSchema = z.object({
  versionId: z.string().min(1),
});

/** Same fail-closed contract as POST /repair when the lease cannot be proven. */
function leaseUnavailableResponse() {
  return NextResponse.json(
    {
      success: false,
      error: "lease_unavailable",
      code: "lease_unavailable",
      retryable: true,
    },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}

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

    // Distributed lease (Plan C / P1 + L4): don't accept (= promote) while a
    // verify/repair job still holds an active lease on this version — that
    // job may still be mutating the row. Fail-closed: a probe/query error is
    // retryable 503, never "no lease" / "no pending repair".
    try {
      if (await hasActiveVersionLease(scoped.version.id)) {
        return NextResponse.json(
          {
            error: "A verify/repair job is currently running on this version. Try again shortly.",
            code: "version_busy",
          },
          { status: 409 },
        );
      }
    } catch (err) {
      console.warn(
        `[accept-repair] Lease probe unavailable on ${scoped.version.id}; failing closed (retryable):`,
        err,
      );
      return leaseUnavailableResponse();
    }

    const accepted = await acceptRepair(
      scoped.version.id,
      "Server repair accepted and applied.",
    );
    if (accepted === "lease_unavailable") {
      return leaseUnavailableResponse();
    }
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
