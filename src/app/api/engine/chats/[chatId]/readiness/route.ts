import { NextResponse } from "next/server";
import {
  failVersionVerification,
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
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

const STALE_VERIFICATION_TIMEOUT_MS = 5 * 60 * 1000;

function isTimedOutVerificationState(
  verificationState: string | null | undefined,
  createdAt: string | Date | null | undefined,
): boolean {
  if (verificationState !== "pending" && verificationState !== "verifying") {
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
  };
}

function buildPlaceholderCoveredEnvWarning(keys: string[]): ChatReadinessItem {
  return {
    id: "placeholder-env",
    title: "Vissa miljövariabler använder preview-placeholders.",
    detail: `Fungerar i preview men behöver riktiga värden vid publicering: ${keys.join(", ")}`,
    severity: "warning",
    action: "env",
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

  if (status === "repair_available") {
    return {
      id: "version-repair-available",
      title: "En serverreparation väntar på godkännande.",
      detail:
        summary ||
        "Acceptera reparationen i versionspanelen för att applicera fixen innan publicering.",
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "failed") {
    return {
      id: "version-failed",
      title: "Versionen är markerad som misslyckad (quality gate).",
      detail:
        summary ||
        "Deploy är inte blockerad — kontrollera loggar och kör autofix om du vill. För produktion bör build/typecheck passera.",
      severity: "warning",
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

  if (isTimedOutVerificationState(version.verification_state, version.created_at)) {
    const timedOutVersion = await failVersionVerification(
      version.id,
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

  const [versionFiles, projectEnv, errorLogs] = await Promise.all([
    getVersionFiles(version.id),
    resolveProjectEnv(chat.project_id ?? null),
    getEngineVersionErrorLogs(version.id),
  ]);

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
  // auto-handled in the project's `env.env` file with placeholders so
  // the chat never has to ask the user. Only when the user opts into
  // F3 ("Bygg nu") do missing env keys become blockers.
  // See `.cursor/rules/env-flow-f2-mute.mdc`.
  const lifecycleStage =
    typeof version.lifecycle_stage === "string" ? version.lifecycle_stage : "design";
  const envGateActive = lifecycleStage === "integrations";

  const envRequirements = resolveEnvRequirementsFromVersionFiles(
    versionRows,
    projectEnv,
    { lifecycleStage: envGateActive ? "integrations" : "design" },
  );
  const { requiredEnvKeys, configuredEnvKeys, missingEnvKeys, placeholderCoveredKeys } = envRequirements;

  if (envGateActive) {
    if (requiredEnvKeys.length > 0 && !chat.project_id) {
      blockers.push({
        id: "project-context-missing",
        title: "Projektkontext saknas för miljövariabler.",
        detail: "Spara projektet först så att miljövariabler kan kopplas till rätt projekt.",
        severity: "blocker",
        action: "env",
      });
    } else if (missingEnvKeys.length > 0) {
      blockers.push(buildMissingEnvBlocker(missingEnvKeys));
    }

    if (placeholderCoveredKeys.length > 0) {
      warnings.push(buildPlaceholderCoveredEnvWarning(placeholderCoveredKeys));
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
    },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
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
