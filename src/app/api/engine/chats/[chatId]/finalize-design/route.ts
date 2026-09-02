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
 *  - `200 OK` with the normal F3 stream metadata when at least one planned
 *    integration dossier still needs to be wired (or a detected integration
 *    has a real build requirement).
 *  - `200 OK` with `action: "deterministic_release"` when no planned dossier
 *    remains to be installed and the already-present integration code needs no
 *    real build key. This route then forks a new F3 row from the exact F2 files,
 *    and the client runs ReleaseGate without a general F3 LLM round.
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
import {
  createDraftVersion,
  appendF3ApprovedToSnapshot,
  getLatestVersion,
  getPreferredVersion,
  getVersionsByChat,
} from "@/lib/db/chat-repository-pg";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  getDossiersByCapability,
  resolvePendingIntegrationDossiers,
} from "@/lib/gen/dossiers";
import {
  checkTier3ReadinessForVersion,
} from "@/lib/integrations/tier3-readiness-gate";
import { hasRequiredRealBuildKeys } from "@/lib/integrations/tier3-build-spec";
import { logTier3MissingEnvBlockedDetached } from "@/lib/integrations/log-tier3-missing-env";

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
    if (parsed.data.versionId && !requestedVersion) {
      // Do not silently replace an explicit foreign/missing version id with
      // this chat's latest version. The deterministic ReleaseGate must stay
      // bound to the exact tenant-scoped F2 version the user selected.
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
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
            "Den här versionen är redan en integrationsversion. Välj designversionen att forka från.",
        },
        { status: 409 },
      );
    }

    const versionFiles = await getVersionFiles(baseVersion.id).catch(() => null);
    const pendingDossiers = resolvePendingIntegrationDossiers({
      snapshot: chat.orchestration_snapshot as Record<string, unknown> | null,
      versionFiles,
    });
    const pendingDossierIds = pendingDossiers.map((selected) => selected.entry.id);

    // `checkTier3ReadinessForVersion` is the shared owner used by the stream
    // route as well. It resolves snapshot ∪ version-presence, Product
    // Postcheck, and per-key build enforcement once, so the F3 entry points
    // cannot disagree about selected Byggblock or build blockers.
    let gate: Awaited<ReturnType<typeof checkTier3ReadinessForVersion>>;
    try {
      gate = await checkTier3ReadinessForVersion({
        versionId: baseVersion.id,
        orchestrationSnapshot: chat.orchestration_snapshot,
        projectId: chat.project_id,
        preloadedFiles: versionFiles,
        pendingApprovedDossierIds: pendingDossierIds,
      });
    } catch (error) {
      console.warn("[finalize-design] F3 readiness unavailable:", error);
      return NextResponse.json(
        {
          ready: false,
          reason: "version_files_unavailable",
          parentVersionId: baseVersion.id,
          message:
            "Kunde inte läsa versionens filer — kan inte avgöra om integrationsbygget är redo. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    if (
      !gate.ok &&
      (gate.reason === "product_postcheck_blocked" ||
        gate.reason === "product_postcheck_pending" ||
        gate.reason === "product_postcheck_indeterminate" ||
        gate.reason === "product_postcheck_superseded")
    ) {
      const retryable = gate.retryable === true;
      const message =
        gate.reason === "product_postcheck_blocked"
          ? "Integrationsbygget är spärrat av Product Postcheck. Åtgärda blockerande previewproblem i designläget innan du bygger integrationer."
          : gate.reason === "product_postcheck_superseded"
            ? "Produktkontrollen ersattes av en nyare preview — försök igen."
            : "Produktkontrollens dom saknas eller kunde inte läsas — försök igen.";
      return NextResponse.json(
        {
          ready: false,
          reason: gate.reason,
          parentVersionId: baseVersion.id,
          verdict: gate.verdict,
          retryable,
          message,
        },
        { status: 409 },
      );
    }

    if (!gate.ok && gate.reason === "version_files_unavailable") {
      return NextResponse.json(
        {
          ready: false,
          reason: "version_files_unavailable",
          parentVersionId: baseVersion.id,
          message:
            "Kunde inte läsa versionens filer — kan inte avgöra om integrationsbygget är redo. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    if (!gate.ok && gate.reason === "missing_env") {
      // R7: durable observation for /logg — best-effort, never blocks 412.
      logTier3MissingEnvBlockedDetached({
        chatId,
        versionId: baseVersion.id,
        projectId: chat.project_id ?? null,
        missingByIntegration: gate.readiness.missingByIntegration,
        source: "finalize-design",
      });
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          projectId: chat.project_id,
          missingByIntegration: gate.readiness.missingByIntegration,
          requirements: gate.spec.requirements,
          message:
            "Tunga integrationer kräver riktiga env-variabler innan integrationsbygget kan köras.",
        },
        { status: 412 },
      );
    }

    if (!gate.ok) {
      return NextResponse.json(
        {
          ready: false,
          parentVersionId: baseVersion.id,
          message: "Kunde inte avgöra om integrationsbygget är redo. Ladda om och försök igen.",
        },
        { status: 409 },
      );
    }

    // A valid gate has a spec. A planned dossier always needs one LLM round so
    // its provider-specific files can be installed, independently of env-key
    // enforcement. Only when no dossier remains pending may an empty/no-build-
    // key spec use the byte-for-byte F3 fork below.
    const requirements = gate.spec.requirements;
    if (pendingDossiers.length > 0) {
      const pendingCapabilities = Array.from(
        new Set(pendingDossiers.map((selected) => selected.entry.capability)),
      );
      // Godkännandet ERSÄTTER tidigare val för samma capability. Selektionen
      // tillåter bara ett syskon per capability, så ett kvarliggande
      // `clerk-auth` (godkänt förut, aldrig levererat) skulle mata
      // `dossierProviderHints` samtidigt som det nyvalda `supabase-auth` — och
      // vid dubbelträff föredrar `pickForCapability` defaulten, alltså byggs
      // fel provider. Peka ut syskonen så unionen får släppa dem.
      const approvedIds = new Set(pendingDossierIds);
      const supersededDossierIds = pendingCapabilities.flatMap((capability) =>
        getDossiersByCapability(capability)
          .map((sibling) => sibling.id)
          .filter((id) => !approvedIds.has(id)),
      );
      try {
        const persisted = await appendF3ApprovedToSnapshot(
          chat.id,
          pendingCapabilities,
          pendingDossierIds,
          supersededDossierIds,
        );
        if (!persisted) throw new Error("approval snapshot was not updated");
      } catch (error) {
        console.warn("[finalize-design] planned dossier approval unavailable:", error);
        return NextResponse.json(
          {
            ready: false,
            reason: "f3_approval_unavailable",
            parentVersionId: baseVersion.id,
            message:
              "Kunde inte låsa de planerade byggblocken för F3. Försök igen.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ready: true,
        parentVersionId: baseVersion.id,
        requirements,
        plannedDossierIds: pendingDossierIds,
        streamMeta: {
          lifecycleStage: "integrations",
          parentVersionId: baseVersion.id,
        },
      });
    }

    if (!hasRequiredRealBuildKeys(gate.spec)) {
      if (typeof baseVersion.files_json !== "string" || !baseVersion.files_json.trim()) {
        return NextResponse.json(
          {
            ready: false,
            reason: "version_files_unavailable",
            parentVersionId: baseVersion.id,
            message:
              "Kunde inte läsa versionens exakta filer — kan inte skapa integrationsversionen.",
          },
          { status: 409 },
        );
      }

      // Sequential retries reuse the exact same deterministic child. Comparing
      // the stored files_json guarantees this never mistakes a real LLM-built
      // F3 child for the exact-file fork.
      let f3Version: Awaited<ReturnType<typeof createDraftVersion>>;
      let existingFork: Awaited<
        ReturnType<typeof getVersionsByChat>
      >[number] | undefined;
      try {
        const exactForks = (await getVersionsByChat(chat.id)).filter(
          (version) =>
            version.lifecycle_stage === "integrations" &&
            version.parent_version_id === baseVersion.id &&
            version.files_json === baseVersion.files_json,
        );
        existingFork =
          exactForks.find(
            (version) =>
              version.release_state === "promoted" &&
              version.verification_state === "passed",
          ) ?? exactForks[0];
        f3Version =
          existingFork ??
          (await createDraftVersion(
            chat.id,
            null,
            baseVersion.files_json,
            undefined,
            {
              stage: "integrations",
              parentVersionId: baseVersion.id,
              // Copy the F2 base's persisted dossier env keys for consistency
              // with the exact-file fork. Harmless on an F3 row: the mock-seed
              // only runs for design-stage previews.
              selectedDossierEnvKeys:
                Array.isArray(baseVersion.selected_dossier_env_keys) &&
                baseVersion.selected_dossier_env_keys.length > 0
                  ? baseVersion.selected_dossier_env_keys
                  : null,
            },
          ));
      } catch (error) {
        console.warn("[finalize-design] deterministic F3 fork unavailable:", error);
        return NextResponse.json(
          {
            ready: false,
            reason: "f3_fork_unavailable",
            parentVersionId: baseVersion.id,
            message:
              "Kunde inte skapa integrationsversionen just nu. Försök igen.",
          },
          { status: 409 },
        );
      }
      const alreadyPromoted =
        f3Version.release_state === "promoted" &&
        f3Version.verification_state === "passed";

      return NextResponse.json({
        ready: true,
        action: "deterministic_release",
        parentVersionId: baseVersion.id,
        versionId: f3Version.id,
        lifecycleStage: "integrations",
        gateRequired: !alreadyPromoted,
        reused: Boolean(existingFork),
        releaseState: f3Version.release_state,
        verificationState: f3Version.verification_state,
        requirements,
        message:
          alreadyPromoted
            ? "Den exakta integrationsversionen är redan godkänd av ReleaseGate."
            : "Byggblocket behåller designversionens visuella fallback. ReleaseGate körs på en exakt integrationsversion utan LLM-generering.",
      });
    }

    return NextResponse.json({
      ready: true,
      parentVersionId: baseVersion.id,
      requirements,
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
