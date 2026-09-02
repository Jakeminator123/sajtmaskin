import { NextResponse } from "next/server";
import { transientDbResponseIfRetryable } from "@/lib/api/transient-db-response";
import { withRateLimit } from "@/lib/rate-limit";
import {
  getLatestVersion,
  maybeAutoAcceptTimedOutRepair,
  getPreferredVersion,
  promoteVersionIfUnleased,
} from "@/lib/db/chat-repository-pg";
import {
  resolveDeployReleaseGate,
  resolveEngineVersionLifecycleStatus,
} from "@/lib/db/engine-version-lifecycle";
import { getEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { readPreviewDiagnosticMeta } from "@/lib/gen/preview/diagnostics";
import {
  isLatestGateVerdictGreen,
  resolveLatestGateAdvisoryChecks,
  resolveGateFailureSummaryFromLogs,
} from "@/lib/gen/verify/gate-failure-summary";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildChatReadiness,
  projectLateClientErrorReadiness,
  projectProductPostcheckReadiness,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import {
  buildReleaseGateBlocker,
  withReadinessCategory,
} from "./readiness-payload";
import { findInvalidJsonConfigPaths } from "@/lib/deploy/version-file-integrity";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/projects/project-env-resolver";
import { resolveSelectedDossiersWithVersionPresence } from "@/lib/gen/dossiers/version-presence";
import { resolvePendingIntegrationDossiers } from "@/lib/gen/dossiers";
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import { hasRequiredRealBuildKeys } from "@/lib/integrations/tier3-build-spec";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { REPAIR_ACCEPT_TIMEOUT_MINUTES } from "@/lib/gen/defaults";
import {
  RECONCILED_PROMOTE_SUMMARY,
  settleStaleVerificationIfNeeded,
} from "@/lib/gen/verify/settle-stale-verification";

function buildMissingEnvBlocker(missingEnvKeys: string[]): ChatReadinessItem {
  return {
    id: "missing-env",
    title: "Obligatoriska nycklar saknas.",
    detail: `Saknas: ${missingEnvKeys.join(", ")}. Lägg till dem under Byggblock.`,
    severity: "blocker",
    action: "env",
    envKeys: missingEnvKeys,
  };
}

function buildPlaceholderCoveredEnvWarning(keys: string[]): ChatReadinessItem {
  return {
    id: "placeholder-env",
    title: "Vissa nycklar använder tillfälliga värden i förhandsvisningen.",
    detail: `Lägg in riktiga värden innan publicering: ${keys.join(", ")}`,
    severity: "warning",
    action: "env",
    envKeys: keys,
  };
}

function buildFeatureRuntimeEnvInfo(keys: string[]): ChatReadinessItem {
  return {
    id: "feature-runtime-env",
    title: `${keys.length} ${keys.length === 1 ? "funktion behöver" : "funktioner behöver"} ställas in när ${keys.length === 1 ? "den används" : "de används"}.`,
    detail: `Sajten syns utan dem, men ${keys.length === 1 ? "funktionen ber" : "funktionerna ber"} om nycklar när någon aktiverar ${keys.length === 1 ? "den" : "dem"}: ${keys.join(", ")}`,
    severity: "warning",
    action: "env",
    envKeys: keys,
  };
}

/**
 * Plain-language preview issue lines for the Lansering card.
 * Keeps internal diagnostic codes out of user-visible copy (technical detail
 * remains in generation logs via `describePreviewDiagnosticCode` elsewhere).
 */
function describePreviewIssueForReadiness(code?: string | null): string | null {
  switch ((code ?? "").trim()) {
    case "preflight_preview_blocked":
      return "Förhandsvisningen stoppades innan den kunde starta.";
    case "preflight_verification_blocked":
      return "Förhandsvisningen fungerar, men vi hittade problem som måste åtgärdas.";
    case "preview_waiting_for_vm":
      return "Live-förhandsvisningen byggs fortfarande.";
    case "render_route_version_not_found":
      return "Förhandsvisningen kunde inte hitta versionen.";
    case "render_route_chat_not_found":
      return "Förhandsvisningen kunde inte verifiera chatten.";
    case "render_route_files_missing":
      return "Förhandsvisningen hittade inga genererade filer.";
    case "render_route_no_renderable_component":
      return "Förhandsvisningen hittade ingen sida att visa.";
    case "render_route_shim_disabled":
      return "Enkel förhandsvisning är avstängd — vänta på live-förhandsvisningen.";
    case "preview_compile_error":
      return "Förhandsvisningen kunde inte bygga koden.";
    case "preview_validation_error":
      return "Förhandsvisningen stoppades av ett valideringsfel.";
    case "preview_runtime_error":
      return "Förhandsvisningen kraschade när sidan kördes.";
    case "preview_react_render_error":
      return "Förhandsvisningen misslyckades när sidan skulle visas.";
    case "preview_transport_error":
      return "Förhandsvisningen kunde inte laddas.";
    case "preview_ready_timeout":
      return "Förhandsvisningen laddade inte klart i tid.";
    case "preview_document_unavailable":
      return "Förhandsvisningens innehåll kunde inte läsas.";
    case "preview_route_error":
      return "Förhandsvisningen returnerade ett fel.";
    case "preview_missing_url":
      return "Länk till förhandsvisningen saknas för versionen.";
    case "preview_unknown_error":
      return "Förhandsvisningen misslyckades av okänd anledning.";
    default:
      return null;
  }
}

function buildLifecycleBlocker(
  status: string,
  _summary?: string | null,
  stage?: string | null,
): ChatReadinessItem | null {
  // False-green guard: suppress the verifying warning ONLY for an explicit
  // `design` stage. An unknown/null stage keeps the warning (never hide a
  // possibly-real F3 verify). Plain-language card copy — raw verification
  // summaries stay on `info.verificationSummary` for logs/diagnostics.
  const isDesignStage = stage === "design";
  if (status === "draft") {
    return {
      id: "version-draft",
      title: "Versionen är fortfarande ett utkast.",
      detail: "Kör klart kontrollerna innan du publicerar.",
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "verifying") {
    // F2 (`design`) intentionally skips the F3 server-verify lane, so a design
    // version rests at `verifying` with nothing actually running. Surfacing it
    // as a standing "verification in progress" warning is a false signal — a
    // design preview is launchable as-is. Only F3/integrations genuinely waits
    // on verification. Mirrors `env-flow-f2-mute.mdc`.
    if (isDesignStage) return null;
    return {
      id: "version-verifying",
      title: "Vi kontrollerar fortfarande om versionen går att publicera.",
      detail: "Förhandsvisningen fungerar under tiden — vänta tills kontrollen är klar.",
      severity: "warning",
      action: "versions",
    };
  }

  if (status === "repairing") {
    return {
      id: "version-repairing",
      title: "Vi försöker reparera koden automatiskt.",
      detail: "Vänta tills reparationen är klar innan du publicerar.",
      severity: "warning",
      action: "versions",
    };
  }

  if (status === "repair_available") {
    return {
      id: "version-repair-available",
      title: "En reparation väntar på ditt godkännande.",
      // Make the auto-accept behaviour explicit instead of silent: a pending
      // repair is auto-accepted after REPAIR_ACCEPT_TIMEOUT_MINUTES without a
      // manual answer (see maybeAutoAcceptTimedOutRepair). Disclosing it here
      // turns a surprising "sudden fix" into an expected, opted-into outcome.
      detail: `Acceptera reparationen i versionslistan innan du publicerar. Om du inte svarar inom ${REPAIR_ACCEPT_TIMEOUT_MINUTES} minuter accepteras den automatiskt.`,
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "failed") {
    return {
      id: "version-failed",
      title: "Koden går inte att bygga än — vi försöker reparera.",
      detail: "Du kan skriva vad som ska ändras, eller vänta på att reparationen blir klar.",
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "superseded") {
    // Terminal-neutral: en nyare version tog över mitt under verifieringen.
    // Inte ett fel — den nyare versionen äger sin egen readiness. Ingen
    // blocker/varning här; deploy-gaten hanterar F3-fallet separat.
    return null;
  }

  return null;
}

function buildPreviewWarning(detail?: string | null, diagnosticCode?: string | null): ChatReadinessItem {
  const normalizedDetail = describePreviewIssueForReadiness(diagnosticCode);
  return {
    id: "preview-warning",
    title: "Förhandsvisningen har problem.",
    detail: normalizedDetail || detail || "Kontrollera förhandsvisningen innan du publicerar.",
    severity: "warning",
    action: "preview",
  };
}

function buildReadinessPayload(params: {
  blockers?: ChatReadinessItem[];
  warnings?: ChatReadinessItem[];
  info: ChatReadiness["info"];
}): ChatReadiness {
  return buildChatReadiness({
    blockers: (params.blockers ?? []).map(withReadinessCategory),
    warnings: (params.warnings ?? []).map(withReadinessCategory),
    info: params.info,
  });
}

function buildNoVersionReadiness(): ChatReadiness {
  return buildReadinessPayload({
    blockers: [
      {
        id: "no-version",
        title: "Ingen version är vald.",
        detail: "Generera eller välj en version först.",
        severity: "blocker",
        action: "versions",
      },
    ],
    info: {
      versionId: null,
      lifecycleStatus: null,
      verificationSummary: null,
      appProjectId: null,
      requiredEnvKeys: [],
      configuredEnvKeys: [],
      missingEnvKeys: [],
    },
  });
}

async function buildEngineReadiness(
  request: Request,
  chatId: string,
  requestedVersionId: string | null,
) {
  const chat = await getEngineChatByIdForRequest(request, chatId);
  if (!chat) {
    return null;
  }

  const requestedVersion = requestedVersionId
    ? await getEngineVersionForChatByIdForRequest(request, chatId, requestedVersionId)
    : null;
  let version =
    requestedVersion?.version ??
    (await getPreferredVersion(chat.id)) ??
    (await getLatestVersion(chat.id));

  if (!version || version.chat_id !== chat.id) {
    return buildNoVersionReadiness();
  }

  const { version: normalizedVersion, wasAutoAccepted } =
    await maybeAutoAcceptTimedOutRepair(version);
  version = normalizedVersion;
  if (wasAutoAccepted) {
    await createEngineVersionErrorLogs([
      {
        chatId: chat.id,
        versionId: version.id,
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

  const [versionFiles, projectEnv, errorLogs] = await Promise.all([
    getVersionFiles(version.id),
    resolveProjectEnv(chat.project_id ?? null),
    getEngineVersionErrorLogs(version.id),
  ]);

  // Lease-safe stale-verification watchdog (shared with /version-status). Fails
  // a version stuck past the route budget ONLY when no job holds an active
  // lease, and prefers the concrete already-logged gate failure over the
  // generic "took too long" copy. Fail-safe: a DB error leaves state unchanged.
  const versionIdForReconcile = version.id;
  const filesRevisionForReconcile = version.files_revision ?? null;
  // Read the chat head at most once per settle and reuse for the head gate
  // (bugbot medium #518) — mirrors the quality-gate route's
  // `isLatestVersionForChat` (`!latest || latest.id === versionId`). A
  // missing/failed read is treated as head.
  let headResolved = false;
  let isHeadVersion = true;
  const resolveIsHeadVersion = async (): Promise<boolean> => {
    if (!headResolved) {
      const latest = await getLatestVersion(chat.id).catch(() => null);
      isHeadVersion = !latest || latest.id === versionIdForReconcile;
      headResolved = true;
    }
    return isHeadVersion;
  };
  const { version: settledVersion } = await settleStaleVerificationIfNeeded(version, {
    resolveFailureSummary: () => resolveGateFailureSummaryFromLogs(errorLogs),
    // BB#299: don't false-red a stale row whose latest gate verdict is green.
    resolveLatestGateGreen: () => isLatestGateVerdictGreen(errorLogs),
    // Bugbot medium (#518): the green reconciliation only applies to the chat
    // head; a non-head (superseded) stale row falls through to terminal-fail.
    resolveIsHeadVersion,
    // Codex P1 (#518): recover a proven-green stale HEAD row to a terminal
    // promoted state via the guarded, LEASE-SAFE promote (bugbot high #518)
    // instead of leaving it in limbo — never promotes while a verify/repair job
    // holds the lease and re-runs checks.
    promoteReconciledVersion: async () => {
      const promoted = await promoteVersionIfUnleased(
        versionIdForReconcile,
        RECONCILED_PROMOTE_SUMMARY,
        { filesRevision: filesRevisionForReconcile },
      );
      // Bugbot medium (#518): mirror the quality-gate route — an advisory
      // (typecheck-only) promotion is NOT solid-green, so emit `version.degraded`
      // after the reconcile-promote takes, else the builder would read a false
      // green `done`. Only a real promoted Version emits (never `"guard_denied"`
      // / `null`). A clean pass emits nothing. Best-effort telemetry.
      const advisoryChecks =
        promoted && promoted !== "guard_denied"
          ? resolveLatestGateAdvisoryChecks(errorLogs)
          : [];
      if (advisoryChecks.length > 0) {
        const lintAdvisory = advisoryChecks.includes("lint");
        try {
          emitBusEvent({
            t: "version.degraded",
            versionId: versionIdForReconcile,
            chatId: chat.id,
            kind: lintAdvisory ? "lint_advisory" : "typecheck_advisory",
            message: lintAdvisory
              ? "ReleaseGate godkändes med ESLint-varningar (advisory)."
              : "Designläge: versionen promotades med typecheck-varningar (advisory).",
            meta: { advisoryChecks },
          });
        } catch {
          // Telemetry only — never block readiness on a bus failure.
        }
      }
      return promoted;
    },
  });
  version = settledVersion;

  const blockers: ChatReadinessItem[] = [];
  const warnings: ChatReadinessItem[] = [];
  if (wasAutoAccepted) {
    // Surface the (previously silent) auto-accept so the user can tell that the
    // active version changed without an explicit "Acceptera fix" click.
    warnings.push({
      id: "repair-auto-accepted",
      title: "En reparation godkändes automatiskt när tiden gick ut.",
      detail:
        "Ändringen sparades utan att du klickade Acceptera. Granska resultatet i versionslistan.",
      severity: "warning",
      action: "versions",
    });
  }
  const lifecycleStatus = resolveEngineVersionLifecycleStatus({
    releaseState: version.release_state,
    verificationState: version.verification_state,
  });
  const lifecycleStage =
    typeof version.lifecycle_stage === "string" ? version.lifecycle_stage : "design";

  const lifecycleItem = buildLifecycleBlocker(
    lifecycleStatus,
    version.verification_summary ?? null,
    // Pass the RAW stage (null when unknown) so the verifying-warning
    // suppression only fires on an explicit `design` row, not on an
    // unknown-stage row defaulted to design for env-gating.
    typeof version.lifecycle_stage === "string" ? version.lifecycle_stage : null,
  );
  if (lifecycleItem) {
    if (lifecycleItem.severity === "blocker") {
      blockers.push(lifecycleItem);
    } else {
      warnings.push(lifecycleItem);
    }
  }

  // Ö1-paritet (A#12): deploy-API:t 409:ar en F3-version som inte passerat
  // ReleaseGate — readiness måste blocka samma version, annars visar UI:t
  // `canDeploy:true` och användaren får ett obegripligt fel vid klick.
  const releaseGateItem = buildReleaseGateBlocker(
    resolveDeployReleaseGate(version),
    Boolean(lifecycleItem && lifecycleItem.severity === "blocker"),
  );
  if (releaseGateItem) {
    blockers.push(releaseGateItem);
  }

  const files = versionFiles ?? [];
  const versionRows = files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => ({ path: file.path as string, content: file.content as string }));

  const invalidJsonPaths = findInvalidJsonConfigPaths(versionRows);
  if (invalidJsonPaths.length > 0) {
    blockers.push({
      id: "invalid-project-json",
      title: "Projektfiler går inte att läsa.",
      detail: `Felaktig JSON i: ${invalidJsonPaths.join(", ")}. Rätta filerna innan du publicerar.`,
      severity: "blocker",
      action: "deploy",
    });
  }

  // F2 (`design`) is a pure visual fidelity stage. Env vars are
  // auto-handled in the project's `env.example` file with placeholders so
  // the chat never has to ask the user. Only when the user opts into
  // F3 ("Bygg integrationer") do missing env keys become blockers.
  // See `.cursor/rules/env-flow-f2-mute.mdc`. `lifecycleStage` is computed
  // above (shared with the lifecycle blocker).
  const envGateActive = lifecycleStage === "integrations";

  // Ägarbeslut 2026-07-22: placeholders alltid tillåtna i F3 (opt-in-flaggan
  // `allowPlaceholdersInF3` är borttagen — demoläge är default).
  const allowPlaceholdersInF3 = envGateActive;

  // One owner (review round 2): snapshot ∪ version-presence — the same set the
  // dossiers panel reports, so an integration built into the version keeps its
  // manifest enforcement here even after F2-mute dropped its capability from
  // the snapshot floor. `files` was already loaded once above.
  const selectedDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: chat.orchestration_snapshot,
    versionFiles: files,
  });

  const envRequirements = resolveEnvRequirementsFromVersionFiles(
    versionRows,
    projectEnv,
    {
      lifecycleStage: envGateActive ? "integrations" : "design",
      allowPlaceholdersInF3,
      selectedDossiers,
    },
  );
  const {
    requiredEnvKeys,
    configuredEnvKeys,
    missingEnvKeys,
    placeholderCoveredKeys,
    buildBlockingKeys,
    featureRuntimeKeys,
    warnOnlyKeys,
    designDeployBlockingKeys,
  } = envRequirements;

  if (envGateActive) {
    if (requiredEnvKeys.length > 0 && !chat.project_id) {
      blockers.push({
        id: "project-context-missing",
        title: "Projektet måste sparas innan miljövariabler kan kopplas.",
        detail: "Spara projektet först så nycklarna kopplas rätt.",
        severity: "blocker",
        action: "env",
      });
    } else if (buildBlockingKeys.length > 0) {
      // Phase 4: ONLY build-enforcement keys block. feature-runtime + warn-only
      // surface as warnings or info. Falls back to legacy `missingEnvKeys`
      // semantics when no enforcement metadata is present (keys default to
      // build, so the two lists overlap fully on legacy callers).
      blockers.push(buildMissingEnvBlocker(buildBlockingKeys));
    }

    if (placeholderCoveredKeys.length > 0) {
      warnings.push(buildPlaceholderCoveredEnvWarning(placeholderCoveredKeys));
    }

    if (featureRuntimeKeys.length > 0) {
      warnings.push(buildFeatureRuntimeEnvInfo(featureRuntimeKeys));
    }
  } else if (designDeployBlockingKeys.length > 0) {
    // M#li2 parity: the deploy route's F2 backstop 409:ar (`DEPLOY_MISSING_ENV`)
    // on exactly this shared set (`designDeployBlockingKeys`, resolver-derived).
    // Readiness must block the same version — `canDeploy` may never lie.
    // Feature-runtime/warn-only keys are excluded by the resolver, so the
    // F2-mute contract (demo publishes stay green) is untouched.
    if (!chat.project_id) {
      // Same guard as the integrations branch: without a saved project no
      // keys can be stored, and the deploy route 403:ar on the missing
      // project link before it ever reaches the env backstop — a missing-env
      // blocker would name the wrong obstacle.
      blockers.push({
        id: "project-context-missing",
        title: "Projektet måste sparas innan miljövariabler kan kopplas.",
        detail: "Spara projektet först så nycklarna kopplas rätt.",
        severity: "blocker",
        action: "env",
      });
    } else {
      blockers.push(buildMissingEnvBlocker(designDeployBlockingKeys));
    }
  }

  const latestPreviewSignal = errorLogs.find(
    (log) =>
      log.level !== "info" &&
      (log.category === "preview" ||
        log.category === "render-telemetry" ||
        log.category === "deploy"),
  );
  if (latestPreviewSignal) {
    const previewMeta = readPreviewDiagnosticMeta(latestPreviewSignal.meta);
    // Prefer plain-language diagnostic mapping; keep raw log message out of
    // the card (it often contains internal vocabulary). Logs retain the detail.
    warnings.push(buildPreviewWarning(null, previewMeta.previewCode));
  }

  // B1: gating Product Postcheck findings paint readiness red. Advisory codes
  // (including `preview_probe_unreadable`) stay warnings. `canDeploy` and
  // promotion still ignore `productBlocked` — `buildChatReadiness` excludes
  // these items from the deploy gate.
  const productPostcheck = projectProductPostcheckReadiness(errorLogs);
  blockers.push(...productPostcheck.blockers);
  warnings.push(...productPostcheck.warnings);

  // SM-050: a post-promotion `preview:client-error` used to stay diagnostic
  // only — readiness stayed "ready" while the preview was broken. Project
  // rows with created_at > promoted_at as advisory warnings. Never blockers.
  warnings.push(...projectLateClientErrorReadiness(errorLogs, version.promoted_at));
  // Ö4a: mirrors the LLM-vs-deterministic branch in `/finalize-design`:
  // a provider-specific dossier still waiting to be installed OR an already-
  // present integration with a real build requirement needs the LLM path.
  // Derived from the same snapshot and preloaded files as the shared gate, so
  // the "Bygg integrationer" tooltip does not guess from flat key lists.
  //
  // En spec som inte går att härleda ger `undefined`, aldrig `false`: samma
  // `null` får `checkTier3ReadinessForVersion` att svara
  // `version_files_unavailable`, vilket `/finalize-design` returnerar som 409.
  // `false` hade alltså lovat den gratis deterministiska vägen för ett klick
  // som i själva verket felar. Bara en härledd spec får uttala sig.
  let hasRealBuildIntegrations: boolean | undefined;
  try {
    const tier3Spec = await deriveTier3BuildSpecForVersion(version.id, selectedDossiers, {
      preloadedFiles: files,
    });
    const pendingDossiers = resolvePendingIntegrationDossiers({
      snapshot: chat.orchestration_snapshot as Record<string, unknown> | null,
      versionFiles: files,
      configuredEnvKeys: new Set(configuredEnvKeys),
    });
    hasRealBuildIntegrations = tier3Spec
      ? pendingDossiers.length > 0 || hasRequiredRealBuildKeys(tier3Spec)
      : undefined;
  } catch {
    hasRealBuildIntegrations = undefined;
  }

  return buildReadinessPayload({
    blockers,
    warnings,
    info: {
      versionId: version.id,
      lifecycleStatus,
      lifecycleStage: lifecycleStage === "integrations" ? "integrations" : "design",
      verificationSummary: version.verification_summary ?? null,
      appProjectId: chat.project_id ?? null,
      requiredEnvKeys,
      configuredEnvKeys,
      missingEnvKeys,
      placeholderCoveredKeys,
      buildBlockingKeys,
      featureRuntimeKeys,
      warnOnlyKeys,
      hasRealBuildIntegrations,
      productPostcheckBlocksF3: productPostcheck.blocksF3,
      productPostcheckBlockedReason: productPostcheck.blockedReason,
    },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(request, "engine:readiness", () => handleGET(request, ctx));
}

async function handleGET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const requestedVersionId = searchParams.get("versionId");

    const readiness = await buildEngineReadiness(request, chatId, requestedVersionId);

    if (!readiness) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      readiness,
    });
  } catch (error) {
    // A1: transient pool/connection failures degrade to a retryable 503 so the
    // SWR poller backs off instead of surfacing a hard 500.
    const degraded = transientDbResponseIfRetryable(error, "[API] readiness");
    if (degraded) return degraded;
    console.error("[API] Failed to build chat readiness:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
