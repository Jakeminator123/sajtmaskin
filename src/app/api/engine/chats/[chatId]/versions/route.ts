import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { engineVersionErrorLogs, versions } from "@/lib/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import {
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import {
  addMessage,
  createDraftVersion,
  getVersionsByChat,
  maybeAutoAcceptTimedOutRepair,
  updateVersionPreviewUrl,
} from "@/lib/db/chat-repository-pg";
import {
  createEngineVersionErrorLogs,
  productPostcheckLogMatchesCurrentFilesRevision,
} from "@/lib/db/services/version-errors";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { transientDbResponseIfRetryable } from "@/lib/api/transient-db-response";
import { readRunStatusForChat } from "@/lib/logging/run-status-reader";
import { readAll } from "@/lib/logging/event-bus";
import { selectVersionStatus } from "@/lib/logging/event-bus-projection";
import {
  reconcileTerminalDbState,
  type ContentRevisionContext,
} from "@/lib/gen/verify/stale-verification";
import { isContentRevisionGateEnabled } from "@/lib/gen/verify/content-revision";
import { getLatestQualityGateSignalsForChat } from "@/lib/db/services/generation-telemetry";
import { incContentRevisionMismatch } from "@/lib/observability/metrics";
import {
  applyProductPostcheckLogReadFailureToVersionStatus,
  applyProductPostcheckReportToVersionStatus,
  filterProductPostcheckEventsForCurrentFilesRevision,
} from "@/lib/db/services/reported-quality-gate";
import type { ProductPostcheckReportLog } from "@/lib/db/services/reported-quality-gate";

async function getProductPostcheckReportsForVersions(
  versionIds: string[],
  currentRevisionByVersion: ReadonlyMap<string, string | null>,
): Promise<Map<string, ProductPostcheckReportLog[]>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db
    .select({
      versionId: engineVersionErrorLogs.version_id,
      category: engineVersionErrorLogs.category,
      message: engineVersionErrorLogs.message,
      meta: engineVersionErrorLogs.meta,
      created_at: engineVersionErrorLogs.created_at,
    })
    .from(engineVersionErrorLogs)
    .where(
      and(
        inArray(engineVersionErrorLogs.version_id, versionIds),
        inArray(engineVersionErrorLogs.category, [
          "product_postcheck.summary",
          "product_postcheck.skipped",
        ]),
      ),
    )
    .orderBy(desc(engineVersionErrorLogs.created_at));
  const byVersion = new Map<string, ProductPostcheckReportLog[]>();
  for (const row of rows) {
    if (
      !productPostcheckLogMatchesCurrentFilesRevision(
        row.meta,
        currentRevisionByVersion.get(row.versionId),
      )
    ) {
      continue;
    }
    const list = byVersion.get(row.versionId) ?? [];
    list.push(row);
    byVersion.set(row.versionId, list);
  }
  return byVersion;
}

// P0 stream-abort recovery (2026-04-26). The `/versions` route is the
// canonical poll surface used by useVersions. By piggy-backing the chat's
// most recent run status here we avoid a second round-trip and let the
// hook stop polling the moment the server says "this chat is dead and
// has no version" — which is the whole point of the P0 fix.
type ChatRunStatus = {
  status: string;
  statusReason: string | null;
  hasVersion: boolean;
  updatedAt: string | null;
};

function buildChatRunStatus(chatId: string, hasVersion: boolean): ChatRunStatus {
  const runStatus = readRunStatusForChat(chatId);
  if (!runStatus) {
    // No log on disk yet (idle/never generated, or generation-log disabled
    // entirely). Default to in_progress so the hook keeps its normal
    // polling cadence — the alternative ("aborted") would falsely freeze
    // a brand-new chat. hasVersion still wins downstream: the UI's
    // "versionless+aborted → no repair" rule is gated on BOTH flags.
    return {
      status: "in_progress",
      statusReason: null,
      hasVersion,
      updatedAt: null,
    };
  }
  return {
    status: runStatus.status,
    statusReason: runStatus.statusReason,
    hasVersion,
    updatedAt: runStatus.updatedAt,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    let engineVersions = engineChat ? await getVersionsByChat(engineChat.id) : [];
    if (engineChat && engineVersions.length > 0) {
      const latestVersion = engineVersions[0] ?? null;
      if (latestVersion) {
        const { version: normalizedLatestVersion, wasAutoAccepted } =
          await maybeAutoAcceptTimedOutRepair(latestVersion);
        if (wasAutoAccepted) {
          engineVersions = [normalizedLatestVersion, ...engineVersions.slice(1)];
          await createEngineVersionErrorLogs([
            {
              chatId: engineChat.id,
              versionId: normalizedLatestVersion.id,
              level: "info",
              category: "server-repair:auto-accepted",
              message: "Pending server repair auto-accepted after timeout.",
              meta: {
                acceptedAt: new Date().toISOString(),
                serverOwned: true,
              },
            },
          ]).catch(() => null);
        }
      }
    }
    if (engineChat && engineVersions.length > 0) {
      // Project bus status first so we only pay for a revision batch read when
      // at least one row can RENDER terminal. The bus is per-instance
      // in-memory, so on serverless the common case is an EMPTY bus (cold
      // start / other instance) where `reconcileTerminalDbState` upgrades an
      // idle projection from the DB's terminal `verification_state` — the
      // gate must therefore look at bus OR DB, not bus alone (Bugbot on this
      // diff: bus-only gating dropped the stale signal exactly where it
      // matters most, right after a deploy).
      const eventsByVersion = new Map(
        engineVersions.map(
          (version) =>
            [
              version.id,
              filterProductPostcheckEventsForCurrentFilesRevision(
                readAll(version.id),
                version.files_revision,
              ),
            ] as const,
        ),
      );
      const projectedByVersion = new Map(
        engineVersions.map(
          (version) => [
            version.id,
            selectVersionStatus(eventsByVersion.get(version.id) ?? []),
          ] as const,
        ),
      );
      const canRenderTerminal = (projected: { phase: string }, verificationState: string | null) =>
        projected.phase === "done" ||
        projected.phase === "failed" ||
        verificationState === "passed" ||
        verificationState === "failed";
      const anyTerminal = engineVersions.some((v) =>
        canRenderTerminal(
          projectedByVersion.get(v.id) ?? selectVersionStatus([]),
          v.verification_state,
        ),
      );
      // Innehållsrevision R15 (flagg-gated): same semantics as `/version-status`,
      // but ONE batched read for the whole chat — never N+1 on this polled list
      // path, and never a DB write. Flag off → zero extra reads (today's path).
      const revisionByVersion =
        anyTerminal && isContentRevisionGateEnabled()
          ? await getLatestQualityGateSignalsForChat(engineChat.id).catch(
              () => new Map(),
            )
          : null;
      // Durable Product Postcheck truth for every version in ONE query. The
      // list route is polled and must never perform one error-log read per row.
      let productPostcheckReadFailed = false;
      const productPostcheckByVersion = anyTerminal
        ? await getProductPostcheckReportsForVersions(
            engineVersions.map((version) => version.id),
            new Map(
              engineVersions.map((version) => [
                version.id,
                version.files_revision?.trim() || null,
              ]),
            ),
          ).catch(() => {
            productPostcheckReadFailed = true;
            return new Map<string, ProductPostcheckReportLog[]>();
          })
        : new Map<string, ProductPostcheckReportLog[]>();

      const versionsList = engineVersions.map((v) => {
          const projected = projectedByVersion.get(v.id) ?? selectVersionStatus([]);
          let contentRevision: ContentRevisionContext | undefined;
          let staleSignalResult: string | null = null;
          if (revisionByVersion && canRenderTerminal(projected, v.verification_state)) {
            const signal = revisionByVersion.get(v.id);
            if (signal?.revisionMatch === "stale") {
              staleSignalResult = signal.result;
              contentRevision = {
                verdictRevision: signal.verdictRevision,
                currentRevision: signal.contentRevision,
              };
            }
          }
          return {
          id: v.id,
          versionId: v.id,
          ...previewUrlField(v.preview_url),
          createdAt: v.created_at,
          versionNumber: v.version_number,
          messageId: v.message_id,
          previewPending: false,
          releaseState: v.release_state,
          verificationState: v.verification_state,
          verificationSummary: v.verification_summary,
          hasPendingRepair:
            typeof v.repaired_files_json === "string" &&
            v.repaired_files_json.trim().length > 0,
          repairAvailableAt: v.repair_available_at,
          promotedAt: v.promoted_at,
          // Fast Edit Lane: parentVersionId + editKind let VersionHistory render
          // quick_edit rows as minor versions (v3.1, v3.2) grouped under their
          // parent instead of bumping the integer version line. Both additive.
          parentVersionId: v.parent_version_id,
          editKind: v.edit_kind,
          // Postmortem follow-up: VersionHistory-tooltip i frontend läser
          // `lifecycleStage` för att skilja F2-design-rader (där server-verify
          // är skipped via `design_preview_skip_verify`) från F3-integrations-
          // rader. När fältet inte mappas hit försvinner det till `undefined`
          // i UI:t och `isServerVerifyExpectedForLifecycle` defaultar till
          // `false`, vilket tystade "Verifierar"-labeln för F3-rader.
          lifecycleStage: v.lifecycle_stage,
          // OMTAG-06 / område 6-2: server-project the canonical event-bus
          // stream per row so VersionHistory renders its lifecycle badge from
          // the bus (`selectVersionStatus`) instead of the now-removed DB-flag
          // resolver `resolveEngineVersionDisplayStatus`. Additive field —
          // existing consumers keep reading the DB-derived fields above.
          // `readAll` is the same pure, side-effect-free reader the
          // `version-status` route already calls in route context; a version
          // with no events folds to `selectVersionStatus([])` → phase "idle".
          //
          // Read-only terminal reconcile (parity with `/version-status`): map an
          // ALREADY-terminal DB `verification_state` (failed/passed) onto a bus
          // that is still spinning, so a died-mid-verify version can't render a
          // perpetual "Verifierar"/"Reparerar" lifecycle badge in VersionHistory
          // while the active-version surface has already settled. Pure + no DB
          // write — the lease-safe watchdog write stays on `/version-status` +
          // `/readiness`; a list poll must never write.
          busStatus: (() => {
            const reconciled = reconcileTerminalDbState(
              projected,
              v.verification_state,
              v.release_state,
              contentRevision,
            );
            // Count the mismatch only when a terminal claim was actually
            // degraded — `withStaleRevisionDegradation` no-ops on non-terminal
            // phases, and the counter must not tick for rows that render as a
            // spinner anyway.
            if (
              staleSignalResult !== null &&
              (reconciled.phase === "done" || reconciled.phase === "failed")
            ) {
              incContentRevisionMismatch("versions_list", { verdict: staleSignalResult });
            }
            const terminal = reconciled.phase === "done" || reconciled.phase === "failed";
            return productPostcheckReadFailed && terminal
              ? applyProductPostcheckLogReadFailureToVersionStatus(reconciled)
              : terminal
                ? applyProductPostcheckReportToVersionStatus(
                  reconciled,
                  productPostcheckByVersion.get(v.id) ?? [],
                  eventsByVersion.get(v.id) ?? [],
                )
                : reconciled;
          })(),
          canPin: false,
      };
      });
      return NextResponse.json({
        versions: versionsList,
        chatStatus: buildChatRunStatus(engineChat.id, true),
      });
    }

    const mappedV0Chat = await getChatByV0ChatIdForRequest(req, chatId);
    if (mappedV0Chat) {
      const dbVersions = await db
        .select({
            id: versions.id,
            v0VersionId: versions.v0VersionId,
            v0MessageId: versions.v0MessageId,
            demoUrl: versions.demoUrl,
            pinned: versions.pinned,
            pinnedAt: versions.pinnedAt,
          createdAt: versions.createdAt,
        })
        .from(versions)
        .where(eq(versions.chatId, mappedV0Chat.id))
        .orderBy(desc(versions.pinned), desc(versions.pinnedAt), desc(versions.createdAt));
      if (dbVersions.length > 0) {
        return NextResponse.json({
          versions: dbVersions.map((v) => ({
              versionId: v.v0VersionId,
              id: v.id,
              messageId: v.v0MessageId,
              ...previewUrlField(v.demoUrl),
              pinned: v.pinned,
              pinnedAt: v.pinnedAt,
            createdAt: v.createdAt,
            hasPendingRepair: false,
            repairAvailableAt: null,
            canPin: true,
          })),
          chatStatus: buildChatRunStatus(mappedV0Chat.id, true),
        });
      }
    }

    return NextResponse.json({
      versions: [],
      // No version yet for this chat. The status decides whether the UI
      // should keep polling (in_progress) or stop and show "Starta om
      // generation" (aborted/failed).
      chatStatus: buildChatRunStatus(engineChat?.id ?? chatId, false),
    });
  } catch (err) {
    // A1: transient pool/connection failures degrade to a retryable 503 so the
    // SWR poller backs off instead of surfacing a hard 500.
    const degraded = transientDbResponseIfRetryable(err, "[API] versions");
    if (degraded) return degraded;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { versionId, pinned, previewUrl } = body ?? {};
    const hasPreviewUrl = Object.prototype.hasOwnProperty.call(body ?? {}, "previewUrl");

    if (
      !versionId ||
      (typeof pinned !== "boolean" && !hasPreviewUrl)
    ) {
      return NextResponse.json(
        { error: "versionId plus either pinned or previewUrl is required" },
        { status: 400 },
      );
    }

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    if (engineChat) {
      if (hasPreviewUrl) {
        const normalizedPreviewUrl =
          typeof previewUrl === "string" && previewUrl.trim().length > 0
            ? previewUrl.trim()
            : null;
        if (previewUrl !== null && previewUrl !== undefined && normalizedPreviewUrl === null) {
          return NextResponse.json(
            { error: "previewUrl must be a non-empty string or null" },
            { status: 400 },
          );
        }
        if (normalizedPreviewUrl) {
          try {
            new URL(normalizedPreviewUrl);
          } catch {
            return NextResponse.json({ error: "previewUrl must be a valid URL" }, { status: 400 });
          }
        }

        const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
        if (!scopedVersion) {
          return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
        }

        const updated = await updateVersionPreviewUrl(
          scopedVersion.version.id,
          normalizedPreviewUrl,
        );
        if (!updated) {
          return NextResponse.json(
            { error: "Failed to update preview URL" },
            { status: 500 },
          );
        }

        return NextResponse.json({
          success: true,
          versionId: scopedVersion.version.id,
          previewUrl: normalizedPreviewUrl,
        });
      }

      return NextResponse.json(
        { error: "Pinning is not supported for own-engine versions." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const versionId = typeof body?.versionId === "string" ? body.versionId : "";

    if ((action !== "restore" && action !== "rollback") || !versionId) {
      return NextResponse.json({ error: "action=restore|rollback and versionId are required" }, { status: 400 });
    }

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    if (!engineChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const existingVersions = await getVersionsByChat(engineChat.id);
    const versionToRestore = existingVersions.find((entry) => entry.id === versionId) ?? null;
    if (!versionToRestore) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const assistantMessage = await addMessage(
      engineChat.id,
      "assistant",
      action === "rollback"
        ? `Rolled back to snapshot from version ${versionToRestore.version_number}.`
        : `Restored snapshot from version ${versionToRestore.version_number}.`,
    );
    // Provenance marker: restore/rollback drafts are intentional user drafts,
    // not stranded generation output — the browser resume-verify lane must not
    // auto-promote them (they follow the manual verify/publish flow). Same
    // nullable edit_kind column as "quick_edit"/"imported_repo".
    const restoredVersion = await createDraftVersion(
      engineChat.id,
      assistantMessage.id,
      versionToRestore.files_json,
      undefined,
      {
        editKind: "restore",
        // Exact-file copy carries the source version's persisted dossier env
        // keys, so a preview of the restored draft keeps the F2 mock-seed
        // (demo mode) the source version's preview had.
        selectedDossierEnvKeys:
          Array.isArray(versionToRestore.selected_dossier_env_keys) &&
          versionToRestore.selected_dossier_env_keys.length > 0
            ? versionToRestore.selected_dossier_env_keys
            : null,
      },
    );
    return NextResponse.json({
      success: true,
      versionId: restoredVersion.id,
      ...previewUrlField(null),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
