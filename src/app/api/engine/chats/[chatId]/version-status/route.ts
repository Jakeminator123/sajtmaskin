/**
 * `GET /api/engine/chats/[chatId]/version-status?versionId=…`
 *
 * Server-projection of the OMTAG-06 event bus to a `VersionStatus` shape
 * for client consumption. This is the **client-readable** counterpart to
 * the existing `selectVersionStatus()` projection that already runs
 * server-side via the bus subscribers — same code path, just exposed as
 * an HTTP read so the builder UI doesn't have to derive status from
 * disparate DB row flags via the now-removed `resolveEngineVersionDisplayStatus`.
 *
 * Use case: `useVersionStatus()` hook in the builder polls / re-fetches
 * this endpoint to keep the active version's status in sync with the
 * authoritative bus stream. `VersionMismatchOverlay` is intentionally
 * driven by `/preview-status` via `usePreviewSession`, because it tracks
 * the live VM session rather than the event-bus lifecycle. As of område
 * 6-2 the version-history badges read the bus too — via the
 * server-enriched `busStatus` field on the `/versions` route — so the
 * legacy DB resolver is no longer the status source for the builder.
 */

import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { readAll } from "@/lib/logging/event-bus";
import { selectVersionStatus } from "@/lib/logging/event-bus-projection";
import type { VersionStatus } from "@/lib/logging/event-bus-types";

export type VersionStatusApiResponse =
  | { ok: true; versionId: string; status: VersionStatus }
  | { ok: false; error: string };

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "engine:version-status", () => handleGET(req, ctx));
}

async function handleGET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const url = new URL(req.url);
    const versionId = url.searchParams.get("versionId")?.trim();

    if (!versionId) {
      return NextResponse.json<VersionStatusApiResponse>(
        { ok: false, error: "versionId query parameter is required." },
        { status: 400 },
      );
    }

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json<VersionStatusApiResponse>(
        { ok: false, error: "Version not found for chat." },
        { status: 404 },
      );
    }

    const events = readAll(scopedVersion.version.id);
    const status = selectVersionStatus(events);

    return NextResponse.json<VersionStatusApiResponse>({
      ok: true,
      versionId: scopedVersion.version.id,
      status,
    });
  } catch (err) {
    console.error("[version-status] GET", err);
    return NextResponse.json<VersionStatusApiResponse>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
