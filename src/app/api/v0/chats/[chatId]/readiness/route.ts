import { NextResponse } from "next/server";
import {
  failVersionVerification,
  getLatestVersion,
  getPreferredVersion,
} from "@/lib/db/chat-repository-pg";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { getEngineVersionErrorLogs } from "@/lib/db/services";
import {
  describePreviewDiagnosticCode,
  readPreviewDiagnosticMeta,
} from "@/lib/gen/preview-diagnostics";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildChatReadiness,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import {
  resolveProjectEnv,
  resolveEnvRequirements,
} from "@/lib/project-env-resolver";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";

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
      detail: summary || "Vänta tills quality gate och efterkontroller är klara.",
      severity: "blocker",
      action: "versions",
    };
  }

  if (status === "failed") {
    return {
      id: "version-failed",
      title: "Versionen är markerad som misslyckad.",
      detail: summary || "Åtgärda verifieringsfelen eller välj en tidigare stabil version.",
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

function buildSeoWarning(detail?: string | null): ChatReadinessItem {
  return {
    id: "seo-warning",
    title: "Den här versionen har SEO-varningar inför lansering.",
    detail: detail || "Kontrollera metadata, robots, sitemap och rubrikstruktur.",
    severity: "warning",
    action: "seo",
  };
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

  const lifecycleBlocker = buildLifecycleBlocker(
    lifecycleStatus,
    version.verification_summary ?? null,
  );
  if (lifecycleBlocker) {
    blockers.push(lifecycleBlocker);
  }

  const [versionFiles, projectEnv, errorLogs] = await Promise.all([
    getVersionFiles(version.id),
    resolveProjectEnv(chat.project_id ?? null),
    getEngineVersionErrorLogs(version.id),
  ]);

  const files = versionFiles ?? [];
  const code = files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => `// File: ${file.path}\n${file.content}`)
    .join("\n\n");
  const envRequirements = resolveEnvRequirements(code, projectEnv);
  const { requiredEnvKeys, configuredEnvKeys, missingEnvKeys } = envRequirements;

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
    if (hasCriticalSeoIssues(latestSeoWarning.meta)) {
      blockers.push({
        id: "seo-critical",
        title: "Versionen saknar kritisk SEO-metadata.",
        detail: "Titel och/eller metadata-export saknas. Dessa krävs för publicering.",
        severity: "blocker",
        action: "seo",
      });
    } else {
      warnings.push(buildSeoWarning(latestSeoWarning.message));
    }
  }

  return buildChatReadiness({
    blockers,
    warnings,
    info: {
      versionId: version.id,
      lifecycleStatus,
      verificationSummary: version.verification_summary ?? null,
      appProjectId: chat.project_id ?? null,
      requiredEnvKeys,
      configuredEnvKeys,
      missingEnvKeys,
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
