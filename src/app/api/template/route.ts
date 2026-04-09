import { NextRequest, NextResponse } from "next/server";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  createProject as createAppProject,
  saveProjectData,
} from "@/lib/db/services/projects";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { withRateLimit } from "@/lib/rateLimit";
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
} from "@/lib/templates/local-v0-template-source";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";

// Allow 5 minutes for own-engine generation
export const maxDuration = 300;

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

function toLegacyTemplateFiles(files: Array<{ path: string; content: string }>): LegacyTemplateFile[] {
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

async function initializeLocalTemplateProject(params: {
  projectId: string;
  template: Template;
}): Promise<{
  chatId: string;
  projectId: string;
  versionId: string;
  previewUrl: string;
  files: LegacyTemplateFile[];
  code: string;
  model: string;
}> {
  const { projectId, template } = params;
  const imported = await loadLocalV0TemplateFiles(template.id);
  if (!imported) {
    throw new Error("Lokal template-zip saknas eller kunde inte lasas.");
  }

  const engineModel = resolveEngineModelId(DEFAULT_MODEL_ID);
  const categoryId = getTemplateCategoryId(template);
  const categoryTitle = getTemplateCategoryTitle(template);

  const chat = await chatRepo.createChat(projectId, String(engineModel));
  const assistantSummary =
    "Projektet importerades fran lokal v0-template och ar redo for vidare andringar i buildern.";
  const assistantMessage = await chatRepo.addMessage(chat.id, "assistant", assistantSummary);
  const files = toLegacyTemplateFiles(imported.files);
  const version = await chatRepo.createDraftVersion(
    chat.id,
    assistantMessage.id,
    JSON.stringify(imported.files),
  );
  const previewSessionStarted = await startPreviewSession(imported.files, {
    chatId: chat.id,
    appProjectId: projectId,
    versionIdForSession: version.id,
    skipRepair: true,
  });
  if (!previewSessionStarted.ok) {
    throw new Error(
      `Tier-2 preview failed (${previewSessionStarted.error.stage}): ${previewSessionStarted.error.message}`,
    );
  }

  const previewUrl = previewSessionStarted.result.sandboxUrl?.trim();
  if (!previewUrl) {
    throw new Error("Tier-2 preview started without a preview URL.");
  }

  await chatRepo.updateVersionPreviewUrl(version.id, previewUrl);
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
    templateBuildIntent:
      getTemplateCatalogItemById(template.id)?.buildIntent === "app" ? "app" : "template",
    projectDataSource: "template-init:local-v0-import",
  });

  return {
    chatId: chat.id,
    projectId,
    versionId: version.id,
    previewUrl,
    files,
    code: mainCode,
    model: String(engineModel),
  };
}

export async function POST(request: NextRequest) {
  return withRateLimit(request, "template:init", async () => {
    try {
      const session = ensureSessionIdFromRequest(request);
      const sessionId = session.sessionId;
      const attachSessionCookie = (response: Response) => {
        if (session.setCookie) {
          response.headers.set("Set-Cookie", session.setCookie);
        }
        return response;
      };

      const body = await request.json();
      const { templateId, quality = "max" } = body as {
        templateId?: string;
        quality?: QualityLevel;
        projectId?: string;
      };
      const requestedProjectId =
        typeof body?.projectId === "string" && body.projectId.trim()
          ? body.projectId.trim()
          : null;

      if (!templateId) {
        return attachSessionCookie(
          NextResponse.json(
            { success: false, error: "Template ID is required" },
            { status: 400 },
          ),
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
          "[API /template] Using local v0 template archive:",
          templateId,
          localTemplateSource?.archivePath,
        );
      }
      if (!localTemplateSource) {
        return attachSessionCookie(
          NextResponse.json(
            {
              success: false,
              error:
                "Den här v0-mallen finns inte nedladdad lokalt ännu och kan därför inte startas som repo i VM-previewn.",
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
            `Mall: ${templateMeta.title}`,
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
            model: imported.model,
          cached: false,
        }),
      );
    } catch (error) {
      console.error("[API /template] Error:", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Handle specific error types with appropriate status codes
      if (errorMessage.includes("not found") || errorMessage.includes("404")) {
        return NextResponse.json(
          {
            success: false,
            error: "Template hittades inte. Välj en annan template.",
          },
          { status: 404 },
        );
      }

      if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
        return NextResponse.json(
          {
            success: false,
            error: "För många förfrågningar. Vänta en stund och försök igen.",
          },
          { status: 429 },
        );
      }

      if (
        errorMessage.includes("API-nyckel") ||
        errorMessage.includes("401") ||
        errorMessage.includes("Project ID is required")
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "API-konfigurationsfel. Kontakta support.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Kunde inte ladda template: ${errorMessage}`,
        },
        { status: 500 },
      );
    }
  });
}
