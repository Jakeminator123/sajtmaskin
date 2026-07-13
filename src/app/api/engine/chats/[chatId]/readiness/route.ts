import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
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
import {
  describePreviewDiagnosticCode,
  readPreviewDiagnosticMeta,
} from "@/lib/gen/preview/diagnostics";
import {
  isLatestGateVerdictGreen,
  resolveLatestGateAdvisoryChecks,
  resolveGateFailureSummaryFromLogs,
} from "@/lib/gen/verify/gate-failure-summary";
import { emit as emitBusEvent } from "@/lib/logging/event-bus";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildChatReadiness,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import {
  buildReleaseGateBlocker,
  buildSeoAdvisoriesFromMeta,
  withReadinessCategory,
} from "./readiness-payload";
import { findInvalidJsonConfigPaths } from "@/lib/deploy/version-file-integrity";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/project-env-resolver";
import { readAllowPlaceholdersInF3 } from "@/lib/project-env-vars";
import { resolveSelectedDossiersWithVersionPresence } from "@/lib/gen/dossiers/version-presence";
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
    title: "Projektet saknar obligatoriska miljövariabler.",
    detail: `Saknas: ${missingEnvKeys.join(", ")}`,
    severity: "blocker",
    action: "env",
    envKeys: missingEnvKeys,
  };
}

function buildPlaceholderCoveredEnvWarning(keys: string[]): ChatReadinessItem {
  return {
    id: "placeholder-env",
    title: "Vissa miljövariabler använder preview-placeholders.",
    detail: `Fungerar i preview men behöver riktiga värden vid publicering: ${keys.join(", ")}`,
    severity: "warning",
    action: "env",
    envKeys: keys,
  };
}

function buildFeatureRuntimeEnvInfo(keys: string[]): ChatReadinessItem {
  return {
    id: "feature-runtime-env",
    title: `${keys.length} ${keys.length === 1 ? "funktion kräver" : "funktioner kräver"} konfiguration vid användning.`,
    detail: `Sajten bygger och visas utan dessa, men respektive feature visar en konfigurations-banner när användaren aktiverar den: ${keys.join(", ")}`,
    severity: "warning",
    action: "env",
    envKeys: keys,
  };
}

function buildLifecycleBlocker(
  status: string,
  summary?: string | null,
  stage?: string | null,
): ChatReadinessItem | null {
  // False-green guard: suppress the verifying warning ONLY for an explicit
  // `design` stage. An unknown/null stage keeps the warning (never hide a
  // possibly-real F3 verify).
  const isDesignStage = stage === "design";
  if (status === "draft") {
    return {
      id: "version-draft",
      title: "Versionen är fortfarande ett draft-utkast.",
      detail: summary || "Kör verifieringen först innan du publicerar.",
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
      title: "Verifiering pågår fortfarande.",
      detail: summary || "Quality gate och efterkontroller körs i bakgrunden. Preview är tillgänglig under tiden.",
      severity: "warning",
      action: "versions",
    };
  }

  if (status === "repairing") {
    return {
      id: "version-repairing",
      title: "Server-side repair pågår.",
      detail:
        summary ||
        "Reparations-loopen försöker laga verifieringsblockerande fynd. Vänta tills den är klar innan du publicerar.",
      severity: "warning",
      action: "versions",
    };
  }

  if (status === "repair_available") {
    const baseDetail =
      summary ||
      "Acceptera reparationen i versionspanelen för att applicera fixen innan publicering.";
    return {
      id: "version-repair-available",
      title: "En serverreparation väntar på godkännande.",
      // Make the auto-accept behaviour explicit instead of silent: a pending
      // repair is auto-accepted after REPAIR_ACCEPT_TIMEOUT_MINUTES without a
      // manual answer (see maybeAutoAcceptTimedOutRepair). Disclosing it here
      // turns a surprising "sudden fix" into an expected, opted-into outcome.
      detail: `${baseDetail} Om du inte svarar inom ${REPAIR_ACCEPT_TIMEOUT_MINUTES} minuter accepteras den automatiskt.`,
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "failed") {
    return {
      id: "version-failed",
      title: "Versionen underkändes av quality gate (typecheck/build).",
      detail:
        summary ||
        "Publicering är blockerad tills typecheck/build passerar. Kör autofix eller en ny förfining och försök publicera igen.",
      severity: "blocker",
      action: "versions",
    };
  }

  return null;
}

function buildPreviewWarning(detail?: string | null, diagnosticCode?: string | null): ChatReadinessItem {
  const normalizedDetail = describePreviewDiagnosticCode(diagnosticCode);
  return {
    id: "preview-warning",
    title: "Den här versionen har preview- eller runtime-problem loggade.",
    detail: normalizedDetail || detail || "Kontrollera previewn innan du publicerar.",
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
              : "F2 render-first: versionen promotades med typecheck-varningar (advisory).",
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
      title: "En serverreparation accepterades automatiskt efter timeout.",
      detail:
        "Reparationen applicerades utan manuell bekräftelse. Granska resultatet i versionspanelen.",
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
      title: "Projektfil(er) går inte att tolka.",
      detail: `Ogiltig JSON: ${invalidJsonPaths.join(", ")}. Rätta filerna (t.ex. package.json / components.json) innan du publicerar.`,
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

  const allowPlaceholdersInF3 = envGateActive
    ? await readAllowPlaceholdersInF3(chat.project_id)
    : false;

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
  } = envRequirements;

  if (envGateActive) {
    if (requiredEnvKeys.length > 0 && !chat.project_id) {
      blockers.push({
        id: "project-context-missing",
        title: "Projektkontext saknas för miljövariabler.",
        detail: "Spara projektet först så att miljövariabler kan kopplas till rätt projekt.",
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
    warnings.push(buildPreviewWarning(latestPreviewSignal.message, previewMeta.previewCode));
  }
  const latestSeoWarning = errorLogs.find((log) => log.category === "seo");
  if (latestSeoWarning) {
    warnings.push(...buildSeoAdvisoriesFromMeta(latestSeoWarning.meta));
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
    console.error("[API] Failed to build chat readiness:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
