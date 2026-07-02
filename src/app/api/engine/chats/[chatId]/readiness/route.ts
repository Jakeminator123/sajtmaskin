import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getLatestVersion,
  maybeAutoAcceptTimedOutRepair,
  getPreferredVersion,
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
import { REPAIR_ACCEPT_TIMEOUT_MINUTES } from "@/lib/gen/defaults";
import { settleStaleVerificationIfNeeded } from "@/lib/gen/verify/settle-stale-verification";

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

  // F3/integrations genuinely waits on server-verify/repair, so an active
  // verify/repair must BLOCK publish (canDeploy=false) — mirrors the shared
  // `resolveDeployBlock` used by the deploy API so readiness and deploy agree.
  // F2 (`design`) and an unknown/null stage stay non-blocking: design is
  // launchable as-is (it never runs server-verify), and an unknown stage keeps
  // a warning so a possibly-real F3 verify is never silently hidden.
  const isIntegrationsStage = stage === "integrations";
  if (status === "verifying") {
    // F2 (`design`) intentionally skips the F3 server-verify lane, so a design
    // version rests at `verifying` with nothing actually running. Surfacing it
    // as a standing "verification in progress" warning is a false signal — a
    // design preview is launchable as-is. Mirrors `env-flow-f2-mute.mdc`.
    if (isDesignStage) return null;
    return {
      id: "version-verifying",
      title: "Verifiering pågår fortfarande.",
      detail: summary || "Quality gate och efterkontroller körs i bakgrunden. Preview är tillgänglig under tiden.",
      severity: isIntegrationsStage ? "blocker" : "warning",
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
      severity: isIntegrationsStage ? "blocker" : "warning",
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

  // Lease-safe stale-verification watchdog (shared with /version-status). Fails
  // a version stuck past the route budget ONLY when no job holds an active
  // lease, and prefers the concrete already-logged gate failure over the
  // generic "took too long" copy. Fail-safe: a DB error leaves state unchanged.
  const { version: settledVersion } = await settleStaleVerificationIfNeeded(version, {
    resolveFailureSummary: () => resolveGateFailureSummaryFromLogs(errorLogs),
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

  // Product-postcheck blocker: the F2 DOM postcheck can run, render fine, and
  // pass the build gate while still finding blocking product defects (dead
  // mobile menu, 2+ broken in-page anchors, runtime crash) — surfaced as a
  // `product_postcheck.summary` log with `meta.productBlocked === true`
  // (emitted by `src/lib/hooks/chat/post-checks.ts`; the server route emits a
  // matching `product_postcheck_blocked` degradation). The preview-signal find
  // above ignores `product_postcheck.*`, so without this a product-blocked
  // version reads green in readiness. Treat it as a publish blocker so the
  // readiness card and deploy stay honest. Mirrors the client detection in
  // `PreviewPanelF3Trigger.hasBlockingProductPostcheck`.
  const productPostcheckBlocked = errorLogs.some((log) => {
    if (log.category !== "product_postcheck.summary") return false;
    const meta =
      log.meta && typeof log.meta === "object"
        ? (log.meta as Record<string, unknown>)
        : null;
    return meta?.productBlocked === true;
  });
  if (productPostcheckBlocked) {
    blockers.push({
      id: "product-postcheck-blocked",
      title: "Produktkontrollen hittade blockerande fel.",
      detail:
        "F2-produktkontrollen (mobilmeny / in-page-länkar) rapporterade blockerande fel. Åtgärda dem innan du publicerar.",
      severity: "blocker",
      action: "preview",
    });
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
