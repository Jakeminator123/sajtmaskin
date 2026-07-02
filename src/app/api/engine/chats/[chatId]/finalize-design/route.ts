/**
 * F3 trigger — "Bygg integrationer".
 *
 * Validates that the user has supplied real values for every tier-3 env
 * key required by the design version, and (when ready) returns the
 * payload the client uses to POST the regular `/stream` endpoint with
 * `meta.lifecycleStage: "integrations"` and `meta.parentVersionId`
 * pointing at the F2 version we forked from.
 *
 * Responses:
 *  - `200 OK` with `{ ready: true, parentVersionId, requirements }` —
 *    client may now call the chat-stream endpoint to run F3.
 *  - `412 Precondition Failed` with `{ ready: false, missingByIntegration }`
 *    — show the env form and have the user fill in the missing keys.
 *  - `404 Not Found` — chat or version not visible to caller.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { getLatestVersion, getPreferredVersion } from "@/lib/db/chat-repository-pg";
import { getStoredProjectEnvVarMap, readAllowPlaceholdersInF3 } from "@/lib/project-env-vars";
import { resolveSelectedDossiersFromSnapshot } from "@/lib/gen/dossiers/snapshot-selection";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import { validateTier3Readiness } from "@/lib/integrations/tier3-build-spec";
// Shared with the stream route's F3 gate (M#818-2) — single owner for the
// file-based spec derivation, see tier3-readiness-gate.ts.
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import { getLatestEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

/**
 * Server-side Product Postcheck block (Codex P1 round 3 on #353). The F3
 * trigger button reads `product_postcheck.summary` from `/error-log` once on
 * mount, so a summary row written AFTER mount (e.g. by the resume-verify
 * lane) is invisible to its cached `productBlocked` state. Enforce the block
 * where it cannot be raced: the newest summary row wins (a later passing
 * postcheck unblocks). Read failures fail open with a log — this gate is
 * defense-in-depth on top of the client button, and a telemetry hiccup must
 * not brick the legit F3 flow.
 */
async function isProductPostcheckBlocked(versionId: string): Promise<boolean> {
  try {
    const logs = await getLatestEngineVersionErrorLogs(versionId, 200);
    const summary = logs.find((log) => log.category === "product_postcheck.summary");
    const meta =
      summary?.meta && typeof summary.meta === "object"
        ? (summary.meta as Record<string, unknown>)
        : null;
    return meta?.productBlocked === true;
  } catch (err) {
    console.warn("[finalize-design] product-postcheck block read failed (fail-open):", err);
    return false;
  }
}

export const runtime = "nodejs";

const requestSchema = z.object({
  versionId: z.string().min(1).optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const chat = await getEngineChatByIdForRequest(request, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const requestedVersion = parsed.data.versionId
      ? await getEngineVersionForChatByIdForRequest(
          request,
          chat.id,
          parsed.data.versionId,
        )
      : null;
    const preferredVersion = await getPreferredVersion(chat.id);
    const latestVersion = preferredVersion ?? (await getLatestVersion(chat.id));
    if (
      requestedVersion?.version &&
      preferredVersion &&
      preferredVersion.chat_id === chat.id &&
      preferredVersion.lifecycle_stage !== "integrations" &&
      preferredVersion.id !== requestedVersion.version.id
    ) {
      return NextResponse.json(
        {
          ready: false,
          reason: "stale_design_version",
          requestedVersionId: requestedVersion.version.id,
          latestVersionId: preferredVersion.id,
          message:
            "En nyare designversion finns. Välj den senaste versionen innan du bygger integrationer.",
        },
        { status: 409 },
      );
    }

    const baseVersion = requestedVersion?.version ?? latestVersion;
    if (!baseVersion || baseVersion.chat_id !== chat.id) {
      return NextResponse.json(
        { error: "No design version found for this chat." },
        { status: 404 },
      );
    }

    if (baseVersion.lifecycle_stage === "integrations") {
      return NextResponse.json(
        {
          ready: false,
          reason: "already_integrations",
          message:
            "Den här versionen är redan en F3-integrationsversion. Välj F2-designversionen att forka från.",
        },
        { status: 409 },
      );
    }

    // Codex P1 round 3 (#353): enforce the Product Postcheck block server-side
    // — the client button's cached `productBlocked` can be stale when the
    // summary row was written after mount (resume-verify lane).
    if (await isProductPostcheckBlocked(baseVersion.id)) {
      return NextResponse.json(
        {
          ready: false,
          reason: "product_postcheck_blocked",
          parentVersionId: baseVersion.id,
          message:
            "Integrationsbygget är spärrat av Product Postcheck. Åtgärda blockerande F2-previewproblem innan du bygger integrationer.",
        },
        { status: 409 },
      );
    }

    const selectedDossiers = resolveSelectedDossiersFromSnapshot(
      chat.orchestration_snapshot,
    );
    const spec = await deriveTier3BuildSpecForVersion(
      baseVersion.id,
      selectedDossiers,
    );

    if (!spec) {
      // G#21: version files unavailable — cannot determine F3 requirements,
      // so we must not claim readiness. Surface an explicit, retryable error
      // instead of a false `ready: true`.
      return NextResponse.json(
        {
          ready: false,
          reason: "version_files_unavailable",
          parentVersionId: baseVersion.id,
          message:
            "Kunde inte läsa versionens filer — kan inte avgöra F3-readiness. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    if (spec.requirements.length === 0) {
      return NextResponse.json({
        ready: true,
        parentVersionId: baseVersion.id,
        requirements: [],
        message:
          "Inga tunga integrationer detekterade. Du kan starta F3 för en strikt build/typecheck-pass.",
        streamMeta: {
          lifecycleStage: "integrations",
          parentVersionId: baseVersion.id,
        },
      });
    }

    const projectEnvVars = chat.project_id
      ? await getStoredProjectEnvVarMap(chat.project_id).catch(
          () => ({} as Record<string, string>),
        )
      : ({} as Record<string, string>);

    // P31 follow-up: when the user has opted into "tillåt placeholders i F3"
    // we accept tier-3 keys that have a preview placeholder (with a
    // warning surfaced separately by readiness/UI). Without this gate the
    // toggle's promise of "publicera ändå" is broken.
    const allowPlaceholdersInF3 = await readAllowPlaceholdersInF3(
      chat.project_id,
    );
    const readiness = validateTier3Readiness(spec, projectEnvVars, {
      allowPlaceholdersForBuildKeys: allowPlaceholdersInF3,
      placeholderEnvKeys: loadPlaceholderKeySet(),
    });

    if (!readiness.ready) {
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          missingByIntegration: readiness.missingByIntegration,
          requirements: spec.requirements,
          message:
            "Tunga integrationer kräver riktiga env-variabler innan F3 kan köras.",
        },
        { status: 412 },
      );
    }

    return NextResponse.json({
      ready: true,
      parentVersionId: baseVersion.id,
      requirements: spec.requirements,
      streamMeta: {
        lifecycleStage: "integrations",
        parentVersionId: baseVersion.id,
      },
    });
  } catch (err) {
    console.error("[finalize-design] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
