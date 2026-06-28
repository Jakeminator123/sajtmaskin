import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import {
  failVersionVerificationIfUnleased,
  getLatestVersion,
  maybeAutoAcceptTimedOutRepair,
  getPreferredVersion,
  leaseTableExists,
} from "@/lib/db/chat-repository-pg";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { getEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import {
  describePreviewDiagnosticCode,
  readPreviewDiagnosticMeta,
} from "@/lib/gen/preview/diagnostics";
import { resolveGateFailureSummaryFromLogs } from "@/lib/gen/verify/gate-failure-summary";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildChatReadiness,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import { findInvalidJsonConfigPaths } from "@/lib/deploy/version-file-integrity";
import {
  resolveProjectEnv,
  resolveEnvRequirementsFromVersionFiles,
} from "@/lib/project-env-resolver";
import { readAllowPlaceholdersInF3 } from "@/lib/project-env-vars";
import { resolveSelectedDossiersFromSnapshot } from "@/lib/gen/dossiers/snapshot-selection";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { STALE_VERIFICATION_TIMEOUT_MS } from "@/lib/gen/defaults";

function isTimedOutVerificationState(
  verificationState: string | null | undefined,
  createdAt: string | Date | null | undefined,
): boolean {
  // `repairing` is included so a repair whose distributed lease was lost
  // (expired / takeover) — making its lease-conditioned failVersionVerification
  // a no-op — doesn't stay stuck in `repairing` forever (manual repair route
  // AND server-verify auto-repair). The recovery write below
  // (failVersionVerificationIfUnleased) is lease-safe: it no-ops while an active
  // lease still owns the version, so a legitimately running repair that keeps
  // renewing its lease is never failed out from under it.
  if (
    verificationState !== "pending" &&
    verificationState !== "verifying" &&
    verificationState !== "repairing"
  ) {
    return false;
  }
  if (!createdAt) {
    return false;
  }

  const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return Date.now() - createdAtMs > STALE_VERIFICATION_TIMEOUT_MS;
}

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

function buildLifecycleBlocker(status: string, summary?: string | null): ChatReadinessItem | null {
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
    const actionable =
      "Previewn visar fortfarande den tidigare versionen. Klicka \u201dAcceptera fix\u201d i versionspanelen för att applicera reparationen innan publicering.";
    return {
      id: "version-repair-available",
      title: "En serverreparation är redo att aktiveras.",
      detail: summary ? `${summary} ${actionable}` : actionable,
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

function hasCriticalSeoIssues(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const issues = (meta as Record<string, unknown>).issues;
  if (!Array.isArray(issues)) return false;
  const criticalCodes = new Set(["missing-metadata", "missing-title"]);
  return issues.some(
    (issue) =>
      typeof issue === "object" &&
      issue !== null &&
      criticalCodes.has((issue as Record<string, unknown>).code as string),
  );
}

function buildNoVersionReadiness(): ChatReadiness {
  return buildChatReadiness({
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

  let staleCandidate = isTimedOutVerificationState(
    version.verification_state,
    version.created_at,
  );
  if (staleCandidate && version.verification_state === "repairing") {
    // Codex P2: the `repairing` watchdog uses version.created_at as its clock, so
    // ANY repair on a version older than the timeout looks "stale". That is only
    // SAFE once the lease table exists: failVersionVerificationIfUnleased then
    // no-ops while an active lease still owns a running repair, so only a truly
    // lost/expired lease is failed. Pre-migration it would degrade to an
    // unconditional fail and kill a still-running unlocked repair — so skip the
    // repairing watchdog entirely and keep the legacy unlocked fallback intact.
    staleCandidate = await leaseTableExists().catch(() => false);
  }
  if (staleCandidate) {
    // 5-minute stale-verification watchdog. Prefer the concrete quality-gate
    // failure already persisted in the error logs (e.g. a deterministic
    // typecheck error) over the generic "took too long" copy — a deterministic
    // gate failure never gets better by "trying again".
    //
    // Distributed lease (Plan C / P1 + Codex P2): fail the stale version ONLY if
    // no job holds an active lease — and do it ATOMICALLY (the NOT EXISTS guard
    // lives inside the UPDATE), so a verify/repair run that acquires the lease in
    // the gap can't have its row failed out from under it. Fail-safe: a DB error
    // returns null and leaves the version state unchanged.
    const concreteFailureSummary = resolveGateFailureSummaryFromLogs(errorLogs);
    const timedOutVersion = await failVersionVerificationIfUnleased(
      version.id,
      concreteFailureSummary ??
        "Automatisk verifiering tog för lång tid. Starta en ny förfining eller försök igen.",
    ).catch(() => null);
    if (timedOutVersion) {
      version = timedOutVersion;
    }
  }

  const blockers: ChatReadinessItem[] = [];
  const warnings: ChatReadinessItem[] = [];
  const lifecycleStatus = resolveEngineVersionLifecycleStatus({
    releaseState: version.release_state,
    verificationState: version.verification_state,
  });

  const lifecycleItem = buildLifecycleBlocker(
    lifecycleStatus,
    version.verification_summary ?? null,
  );
  if (lifecycleItem) {
    if (lifecycleItem.severity === "blocker") {
      blockers.push(lifecycleItem);
    } else {
      warnings.push(lifecycleItem);
    }
  }

  // Decision (P8): keep the timeout auto-accept safety net (so a staged repair
  // that the user never explicitly accepts still eventually applies instead of
  // blocking publish forever), but make it VISIBLE instead of silent. When this
  // poll performed the auto-accept the preview/version just changed under the
  // user, so surface a one-time warning telling them what happened and how to
  // undo it. The persistent record stays in the `server-repair:auto-accepted`
  // error log written above.
  if (wasAutoAccepted) {
    warnings.push({
      id: "repair-auto-accepted",
      title: "Serverreparationen aktiverades automatiskt.",
      detail:
        "Den väntande fixen accepterades automatiskt efter timeout, så previewn och versionen uppdaterades. Granska resultatet och rulla tillbaka i versionspanelen om något ser fel ut.",
      severity: "warning",
      action: "versions",
    });
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
  // See `.cursor/rules/env-flow-f2-mute.mdc`.
  const lifecycleStage =
    typeof version.lifecycle_stage === "string" ? version.lifecycle_stage : "design";
  const envGateActive = lifecycleStage === "integrations";

  const allowPlaceholdersInF3 = envGateActive
    ? await readAllowPlaceholdersInF3(chat.project_id)
    : false;

  const selectedDossiers = resolveSelectedDossiersFromSnapshot(
    chat.orchestration_snapshot,
  );

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
  if (latestSeoWarning && hasCriticalSeoIssues(latestSeoWarning.meta)) {
      blockers.push({
        id: "seo-critical",
        title: "Versionen saknar kritisk SEO-metadata.",
        detail: "Titel och/eller metadata-export saknas. Dessa krävs för publicering.",
        severity: "blocker",
        action: "seo",
      });
  }

  return buildChatReadiness({
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
