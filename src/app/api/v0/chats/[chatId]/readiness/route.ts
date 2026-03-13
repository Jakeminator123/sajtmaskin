import { NextResponse } from "next/server";
import {
  getLatestVersion,
  getPreferredVersion,
} from "@/lib/db/chat-repository-pg";
import { resolveEngineVersionLifecycleStatus } from "@/lib/db/engine-version-lifecycle";
import { getEngineVersionErrorLogs } from "@/lib/db/services";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { detectIntegrations } from "@/lib/gen/detect-integrations";
import { getVersionFiles } from "@/lib/gen/version-manager";
import {
  buildChatReadiness,
  type ChatReadiness,
  type ChatReadinessItem,
} from "@/lib/chat-readiness";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import {
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean)));
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

function buildPreviewWarning(detail?: string | null): ChatReadinessItem {
  return {
    id: "preview-warning",
    title: "Den här versionen har preview- eller runtime-problem loggade.",
    detail: detail || "Kontrollera previewn innan du publicerar.",
    severity: "warning",
    action: "preview",
  };
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
  const version =
    requestedVersion?.version ??
    (await getPreferredVersion(chat.id)) ??
    (await getLatestVersion(chat.id));

  if (!version || version.chat_id !== chat.id) {
    return buildNoVersionReadiness();
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

  const envVarMapPromise = chat.project_id
    ? getStoredProjectEnvVarMap(chat.project_id).catch(() => ({} as Record<string, string>))
    : Promise.resolve<Record<string, string>>({});
  const [versionFiles, envVarMap, errorLogs] = await Promise.all([
    getVersionFiles(version.id),
    envVarMapPromise,
    getEngineVersionErrorLogs(version.id),
  ]);

  const files = versionFiles ?? [];
  const code = files
    .filter((file) => typeof file?.path === "string" && typeof file?.content === "string")
    .map((file) => `// File: ${file.path}\n${file.content}`)
    .join("\n\n");
  const requiredEnvKeys = dedupeStrings(
    detectIntegrations(code).flatMap((integration) => integration.envVars ?? []),
  );

  const configuredEnvKeys = Object.keys(envVarMap)
    .map((key) => key.trim().toUpperCase())
    .filter(Boolean);
  const configuredEnvSet = new Set(configuredEnvKeys);
  const missingEnvKeys = requiredEnvKeys.filter((key) => !configuredEnvSet.has(key));

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

  const latestPreviewError = errorLogs.find(
    (log) =>
      log.level === "error" &&
      (log.category === "preview" ||
        log.category === "render-telemetry" ||
        log.category === "deploy"),
  );
  if (latestPreviewError) {
    warnings.push(buildPreviewWarning(latestPreviewError.message));
  }
  const latestSeoWarning = errorLogs.find((log) => log.category === "seo");
  if (latestSeoWarning) {
    warnings.push(buildSeoWarning(latestSeoWarning.message));
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

async function buildV0FallbackReadiness(request: Request, chatId: string, versionId: string | null) {
  const chat = await getChatByV0ChatIdForRequest(request, chatId);
  if (!chat) {
    return buildNoVersionReadiness();
  }

  return buildChatReadiness({
    blockers: versionId
      ? []
      : [
          {
            id: "no-version",
            title: "Ingen version är vald.",
            detail: "Generera eller välj en version först.",
            severity: "blocker",
            action: "versions",
          },
        ],
    info: {
      versionId,
      lifecycleStatus: null,
      verificationSummary: null,
      appProjectId: chat.id,
      requiredEnvKeys: [],
      configuredEnvKeys: [],
      missingEnvKeys: [],
    },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const requestedVersionId = searchParams.get("versionId");

    const readiness = shouldUseV0Fallback()
      ? await buildV0FallbackReadiness(request, chatId, requestedVersionId)
      : await buildEngineReadiness(request, chatId, requestedVersionId);

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
