import { NextRequest, NextResponse } from "next/server";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { createProject as createAppProject, saveProjectData } from "@/lib/db/services/projects";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { withRateLimit } from "@/lib/rate-limit";
import { DEFAULT_MODEL_ID, type QualityLevel } from "@/lib/models/catalog";
import { resolveEngineModelId } from "@/lib/models/selection";
import {
  getTemplateById,
  getTemplateCategoryId,
  getTemplateCategoryTitle,
  type Template,
} from "@/lib/templates/template-data";
import { getTemplateCatalogItemById } from "@/lib/templates/template-catalog";
import {
  getLocalV0TemplateSourceById,
  loadLocalV0TemplateFiles,
  type LocalV0TemplateSource,
} from "@/lib/templates/local-v0-template-source";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import {
  completeProjectDependencies,
  detectLockfilePackageManager,
  markLockfileStaleInFiles,
} from "@/lib/gen/autofix/dep-completer";
import { runHydrationPreflightChecks } from "@/lib/gen/validation/hydration-preflight";
import { devLogAppend } from "@/lib/logging/dev-log";
import { buildImportedRepoBaselineSnapshot } from "@/lib/templates/imported-repo-contract";
import {
  persistImportedRepoInitialization,
  recordImportedRepoPreviewOutcome,
} from "@/lib/templates/imported-repo-initialization";

// Allow 5 minutes for own-engine generation
export const maxDuration = 300;

// P19 Steg 4: 30-dygnströskel för informationsvarning om äldre lokal v0-källa.
// Informationsnivå — blockerar inte import, klienter väljer om varningen ska visas.
const STALENESS_THRESHOLD_SECONDS = 60 * 60 * 24 * 30;

type TemplateSourceMetadata = {
  templateId: string;
  sourceKind: "local" | "blob";
  timestamp: string | null;
  ageSeconds: number | null;
  stale: boolean;
  sourceSlugs: string[];
  categoryLabel: string | null;
  archiveUrl?: string | null;
};

function buildTemplateSourceMetadata(
  source: LocalV0TemplateSource,
  now: number = Date.now(),
): TemplateSourceMetadata {
  let ageSeconds: number | null = null;
  if (source.timestamp) {
    const parsed = Date.parse(source.timestamp);
    if (Number.isFinite(parsed)) {
      ageSeconds = Math.max(0, Math.floor((now - parsed) / 1000));
    }
  }
  const stale = ageSeconds !== null && ageSeconds > STALENESS_THRESHOLD_SECONDS;
  return {
    templateId: source.templateId,
    sourceKind: source.sourceKind ?? "local",
    timestamp: source.timestamp,
    ageSeconds,
    stale,
    sourceSlugs: [...source.sourceSlugs],
    categoryLabel: source.categoryLabel,
    archiveUrl: source.sourceKind === "blob" ? (source.archiveUrl ?? null) : null,
  };
}

const loadingMessages = [
  "Laddar template...",
  "Förbereder din design...",
  "Hämtar komponenter...",
  "Optimerar koden...",
];

function getRandomMessage() {
  return loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
}

type LegacyTemplateFile = {
  name: string;
  content: string;
};

function toLegacyTemplateFiles(
  files: Array<{ path: string; content: string }>,
): LegacyTemplateFile[] {
  return files.map((file) => ({
    name: file.path,
    content: file.content,
  }));
}

function findMainTemplateFile(files: LegacyTemplateFile[]): LegacyTemplateFile | undefined {
  if (!files.length) return undefined;
  return (
    files.find(
      (file) =>
        file.name.includes("page.tsx") ||
        file.name.includes("Page.tsx") ||
        file.name.endsWith(".tsx"),
    ) ?? files[0]
  );
}

async function persistTemplateProjectData(params: {
  projectId: string;
  chatId: string;
  demoUrl: string | null;
  currentCode: string;
  files: LegacyTemplateFile[] | null;
  templateId: string;
  templateTitle: string;
  templateCategoryId: string;
  templateCategoryTitle: string;
  templateBuildIntent: "template" | "app";
  projectDataSource?: string;
}): Promise<void> {
  const {
    projectId,
    chatId,
    demoUrl,
    currentCode,
    files,
    templateId,
    templateTitle,
    templateCategoryId,
    templateCategoryTitle,
    templateBuildIntent,
    projectDataSource,
  } = params;
  const persistedChat = await chatRepo.getChat(chatId);
  await saveProjectData({
    project_id: projectId,
    chat_id: chatId,
    demo_url: demoUrl,
    current_code: currentCode,
    files: files ?? [],
    messages: persistedChat?.messages ?? [],
    meta: {
      source: projectDataSource ?? "template-init:own-engine",
      templateId,
      templateTitle,
      templateCategoryId,
      templateCategoryTitle,
      templateBuildIntent,
    },
  });
}

// Advisory user-facing copy when the import succeeded but the preview VM
// never booted. Vendor-neutral by design (no host/provider names).
const PREVIEW_START_FAILED_MESSAGE =
  "Templaten importerades, men förhandsvisningen kunde inte startas just nu. Försök igen om en stund.";

async function initializeLocalTemplateProject(params: {
  projectId: string;
  template: Template;
}): Promise<{
  chatId: string;
  projectId: string;
  versionId: string;
  previewUrl: string | null;
  previewStartFailed: boolean;
  previewStartError: string | null;
  files: LegacyTemplateFile[];
  code: string;
  model: string;
}> {
  const { projectId, template } = params;
  const imported = await loadLocalV0TemplateFiles(template.id);
  if (!imported) {
    throw new Error("Lokal template-zip saknas eller kunde inte lasas.");
  }

  // First-preview installability (req A1): an imported v0 template starts its
  // preview verbatim (skipRepair + skipProjectScaffold), so a template that
  // imports a package it never declared (e.g. `import … from "radix-ui"`) would
  // otherwise reach the preview host with an incomplete package.json → Next
  // build-error overlay. Run deterministic dependency completion here so KNOWN
  // missing deps are pinned before the first boot. When that mutates a template
  // that carries its own lockfile, mark the lockfile stale so the host runs one
  // non-frozen install (the readiness gate now fails a still-broken template
  // visibly instead of stamping it healthy).
  const depCompletion = completeProjectDependencies(imported.files);
  let preparedFiles = depCompletion.files;
  const pinnedDependencies = Object.keys(depCompletion.pinnedDependencies);
  if (pinnedDependencies.length > 0) {
    const lockfilePackageManager = detectLockfilePackageManager(preparedFiles);
    if (lockfilePackageManager) {
      preparedFiles = markLockfileStaleInFiles(preparedFiles, {
        reason: `dep-completer pinned ${pinnedDependencies.length} dependency/-ies on import: ${pinnedDependencies.join(", ")}`,
        packageManager: lockfilePackageManager,
        makeFile: (path, content) => ({ path, content, language: "json" }),
      });
    }
    console.info(
      "[API /template] Pinned missing dependencies before first preview:",
      pinnedDependencies.join(", "),
      depCompletion.unknownPackages.length > 0
        ? `(unknown, not pinned: ${depCompletion.unknownPackages.join(", ")})`
        : "",
    );
  }

  const engineModel = resolveEngineModelId(DEFAULT_MODEL_ID);
  const categoryId = getTemplateCategoryId(template);
  const categoryTitle = getTemplateCategoryTitle(template);
  const templateBuildIntent =
    getTemplateCatalogItemById(template.id)?.buildIntent === "app" ? "app" : "template";

  const chat = await chatRepo.createChat(projectId, String(engineModel));
  // The imported base version is NOT an AI-generated "version 1": say so.
  // The copy sets the user's mental model for the whole chat — the template's
  // own stack/file tree is authoritative and the first real prompt is a
  // follow-up edit on it (imported repo mode), never a fresh scaffold init.
  const assistantSummary = `Välkommen! Templaten "${template.title}" importerades som basversion — dess egen kodstruktur och paketversioner behålls som de är. Skriv vad du vill ändra så bygger vi vidare på den.`;
  const assistantMessage = await chatRepo.addMessage(chat.id, "assistant", assistantSummary);
  const files = toLegacyTemplateFiles(preparedFiles);
  const version = await chatRepo.createDraftVersion(
    chat.id,
    assistantMessage.id,
    JSON.stringify(preparedFiles),
    undefined,
    // Mark the imported v0 repo so follow-up generations treat it as a
    // verbatim repo edit (skip scaffold assembly + relax scaffold-only
    // preflight gates) instead of forcing the landing-page scaffold contract.
    { editKind: "imported_repo" },
  );

  // Imported repositories stay truly scaffold-less. Instead, bind a compact,
  // immutable structural contract to the exact normalized version before the
  // first preview starts. Follow-ups compare that baseline with their actual
  // parent files; metadata failures never block a valid import.
  const importedRepoOrigin = {
    kind: "v0_template" as const,
    templateId: imported.source.templateId,
    templateCategory: categoryId,
    archiveSha256: imported.source.archiveSha256 ?? undefined,
  };
  const importedRepoBaseline = buildImportedRepoBaselineSnapshot({
    files: preparedFiles,
    origin: importedRepoOrigin,
    versionId: version.id,
    filesRevision: version.files_revision ?? null,
  });
  await persistImportedRepoInitialization({
    chatId: chat.id,
    versionId: version.id,
    filesRevision: version.files_revision ?? null,
    model: String(engineModel),
    buildIntent: templateBuildIntent,
    files: preparedFiles,
    origin: importedRepoOrigin,
    baseline: importedRepoBaseline,
  });

  let previewUrl: string | null = null;
  let previewStartFailed = false;
  let previewStartError: string | null = null;
  const previewSessionStarted = await startPreviewSession(preparedFiles, {
    chatId: chat.id,
    appProjectId: projectId,
    versionIdForSession: version.id,
    filesRevisionForSession: version.files_revision,
    skipRepair: true,
    skipProjectScaffold: true,
  });
  if (previewSessionStarted.ok) {
    previewUrl = previewSessionStarted.result.previewUrl?.trim() || null;
    if (previewUrl) {
      await chatRepo.updateVersionPreviewUrl(version.id, previewUrl);
    } else {
      // A host response without a usable URL cannot be previewed, even if the
      // transport-level start call itself returned `ok: true`.
      previewStartFailed = true;
      previewStartError = PREVIEW_START_FAILED_MESSAGE;
      console.warn(
        "[API /template] Preview session returned no URL — version saved without live preview.",
      );
    }
  } else {
    // Advisory, never blocks the import: the version is saved and the user can
    // keep working, but the client must be told there is no live preview.
    previewStartFailed = true;
    previewStartError = PREVIEW_START_FAILED_MESSAGE;
    console.warn(
      "[API /template] Preview session failed — version saved without live preview:",
      previewSessionStarted.error.stage,
      previewSessionStarted.error.message,
    );
  }
  if (previewSessionStarted.ok && previewUrl) {
    await recordImportedRepoPreviewOutcome({
      versionId: version.id,
      filesRevision: previewSessionStarted.result.filesRevision ?? version.files_revision ?? null,
      outcome: previewSessionStarted.result.runtimeReady === true ? "runtime-ready" : "pending",
    });
  } else {
    await recordImportedRepoPreviewOutcome({
      versionId: version.id,
      filesRevision: null,
      outcome: "failed",
    });
  }

  // Imported templates skip the generation preflight (skipRepair +
  // skipProjectScaffold), so run the hydration-risk detector here too and log a
  // best-effort advisory. This surfaces v0 templates that render with
  // Math.random()/Date.now() (hydration mismatch) as a builder warning instead
  // of leaving the user with only an opaque console error. Never throws.
  try {
    const hydrationIssues = runHydrationPreflightChecks(
      preparedFiles.map((f) => ({ path: f.path, content: f.content, language: "tsx" })),
    );
    if (hydrationIssues.length > 0) {
      const { createEngineVersionErrorLogs } = await import("@/lib/db/services/version-errors");
      await createEngineVersionErrorLogs(
        [
          {
            chatId: chat.id,
            versionId: version.id,
            level: "warning",
            category: "preview",
            message: `Importerad template använder icke-deterministisk render (${hydrationIssues
              .map((i) => i.pattern)
              .join(", ")}) och kan ge hydration-fel i previewn.`,
            meta: {
              source: "template-import.hydration-preflight",
              issues: hydrationIssues.slice(0, 20),
            },
          },
        ],
        { lockTimeoutMs: 1500 },
      );
    }
  } catch (error) {
    console.warn(
      "[API /template] Hydration advisory logging failed (non-blocking):",
      error instanceof Error ? error.message : error,
    );
  }

  const mainCode = findMainTemplateFile(files)?.content || "";

  await persistTemplateProjectData({
    projectId,
    chatId: chat.id,
    demoUrl: previewUrl,
    currentCode: mainCode,
    files,
    templateId: template.id,
    templateTitle: template.title,
    templateCategoryId: categoryId,
    templateCategoryTitle: categoryTitle,
    templateBuildIntent,
    projectDataSource: "template-init:local-v0-import",
  });

  return {
    chatId: chat.id,
    projectId,
    versionId: version.id,
    previewUrl,
    previewStartFailed,
    previewStartError,
    files,
    code: mainCode,
    model: String(engineModel),
  };
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "template:init", async () => {
    let setCookie: string | null = null;
    const attachSessionCookie = (response: Response) => {
      if (setCookie) {
        response.headers.set("Set-Cookie", setCookie);
      }
      return response;
    };
    try {
      const session = ensureSessionIdFromRequest(request);
      const sessionId = session.sessionId;
      setCookie = session.setCookie;

      const body = await request.json();
      const { templateId, quality = "max" } = body as {
        templateId?: string;
        quality?: QualityLevel;
        projectId?: string;
      };
      const requestedProjectId =
        typeof body?.projectId === "string" && body.projectId.trim() ? body.projectId.trim() : null;

      if (!templateId) {
        return attachSessionCookie(
          NextResponse.json({ success: false, error: "Template ID is required" }, { status: 400 }),
        );
      }

      const templateMeta = getTemplateById(templateId);
      if (!templateMeta) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "Ogiltigt template-id. Välj en template från galleriet.",
            },
            { status: 404 },
          ),
        );
      }

      const user = await getCurrentUser(request);
      const userId = user?.id || null;
      const resolvedRequestedProjectId = requestedProjectId
        ? await resolveAppProjectIdForRequest(
            request,
            { appProjectId: requestedProjectId },
            { sessionId },
          )
        : null;

      if (requestedProjectId && !resolvedRequestedProjectId) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "Projektet hittades inte eller tillhor inte den aktuella sessionen.",
            },
            { status: 404 },
          ),
        );
      }

      console.info(
        "[API /template] Initializing own-engine template:",
        templateId,
        "quality:",
        quality,
        userId ? `(user: ${userId})` : "(anonymous)",
      );

      const localTemplateSource = await getLocalV0TemplateSourceById(templateId);
      if (localTemplateSource) {
        console.info(
          "[API /template] Using v0 template archive:",
          templateId,
          localTemplateSource.sourceKind ?? "local",
          localTemplateSource.archivePath ?? localTemplateSource.archiveUrl,
        );
      }
      if (!localTemplateSource) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              reason: "local_template_source_missing",
              templateId,
              recoverable: true,
              error:
                "Den här v0-templaten finns varken lokalt eller i Blob-manifestet och kan därför inte startas som repo i VM-previewn.",
            },
            { status: 409 },
          ),
        );
      }

      const creditCheck = await prepareCredits(
        request,
        "prompt.template",
        { quality },
        { sessionId },
      );
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const projectId =
        resolvedRequestedProjectId ??
        (
          await createAppProject(
            `Template: ${templateMeta.title}`,
            "template",
            `Own-engine startmall for ${templateMeta.title}`,
            user ? undefined : sessionId || undefined,
            user?.id,
          )
        ).id;

      const imported = await initializeLocalTemplateProject({
        projectId,
        template: templateMeta,
      });

      const sourceMetadata = buildTemplateSourceMetadata(localTemplateSource);
      if (sourceMetadata.stale) {
        devLogAppend("latest", {
          type: "v0-import.stale-source",
          templateId: sourceMetadata.templateId,
          ageSeconds: sourceMetadata.ageSeconds,
          timestamp: sourceMetadata.timestamp,
        });
      }

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge template:", error);
      }

      return attachSessionCookie(
        NextResponse.json({
          success: true,
          message: getRandomMessage(),
          code: imported.code,
          files: imported.files,
          chatId: imported.chatId,
          projectId: imported.projectId,
          versionId: imported.versionId,
          ...previewUrlField(imported.previewUrl),
          ...(imported.previewStartFailed
            ? {
                previewStartFailed: true,
                previewStartError: imported.previewStartError,
              }
            : {}),
          model: imported.model,
          cached: false,
          source: sourceMetadata,
        }),
      );
    } catch (error) {
      console.error("[API /template] Error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Handle specific error types with appropriate status codes
      if (errorMessage.includes("not found") || errorMessage.includes("404")) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "Template hittades inte. Välj en annan template.",
            },
            { status: 404 },
          ),
        );
      }

      if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "För många förfrågningar. Vänta en stund och försök igen.",
            },
            { status: 429 },
          ),
        );
      }

      if (
        errorMessage.includes("API-nyckel") ||
        errorMessage.includes("401") ||
        errorMessage.includes("Project ID is required")
      ) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error: "API-konfigurationsfel. Kontakta support.",
            },
            { status: 500 },
          ),
        );
      }

      return attachSessionCookie(
        NextResponse.json(
          {
            success: false,
            error: `Kunde inte ladda template: ${errorMessage}`,
          },
          { status: 500 },
        ),
      );
    }
  });
}
