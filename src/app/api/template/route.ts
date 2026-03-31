import { NextRequest, NextResponse } from "next/server";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import { cacheTemplateResult, getCachedTemplate } from "@/lib/db/services/templates";
import {
  createProject as createAppProject,
  saveProjectData,
} from "@/lib/db/services/projects";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { generateOwnEngineSiteFromPrompt } from "@/lib/own-engine/generate-site-from-prompt";
import { withRateLimit } from "@/lib/rateLimit";
import { QUALITY_TO_MODEL, type QualityLevel } from "@/lib/models/catalog";
import {
  getTemplateCatalogItemById,
  getTemplateById,
  getTemplateCategoryId,
  getTemplateCategoryTitle,
  type Template,
} from "@/lib/templates";
import { getEngineChatByIdForRequest, resolveAppProjectIdForRequest } from "@/lib/tenant";
import { previewUrlField } from "@/lib/api/preview-url-contract";

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

const TEMPLATE_CATEGORY_HINTS: Partial<Record<string, string>> = {
  "website-templates":
    "Prioritera en stark hemsidestruktur med hero, tydliga sektioner, CTA och sammanhang som känns färdigt direkt.",
  "blog-and-portfolio":
    "Prioritera editorial eller portfolio-känsla, visuell rytm, case studies eller artikelliknande innehåll.",
  layouts:
    "Låt layouten vara extra stark och variationsrik; använd sektioner och komposition som känns genomtänkta snarare än generiska.",
  animations:
    "Lägg extra omsorg på motion, hover states och mjuka övergångar utan att göra sidan rörig.",
  components:
    "Gör resultatet komponentrikt och välkomponerat, med återanvändbara UI-mönster och tydlig designidentitet.",
  "design-systems":
    "Prioritera token-driven styling, konsekvent typografi, komponentkvalitet och en känsla av design system snarare än snabb mockup.",
  "login-and-sign-up":
    "Behandla detta som en app-orienterad startpunkt med autentiseringsflöden, tydliga states och realistisk app-shell där det passar.",
  "apps-and-games":
    "Behandla detta som en applikationsliknande startpunkt med stateful UI, tydliga flöden och gränssnitt som känns som produkt snarare än broschyrsajt.",
};

function parseCachedTemplateFiles(filesJson: string | null): LegacyTemplateFile[] | null {
  if (!filesJson) return null;
  try {
    const parsed = JSON.parse(filesJson) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const file = entry as Record<string, unknown>;
        const name = typeof file.name === "string" ? file.name : null;
        const content = typeof file.content === "string" ? file.content : null;
        return name && content !== null ? { name, content } : null;
      })
      .filter((entry): entry is LegacyTemplateFile => Boolean(entry));
  } catch {
    return null;
  }
}

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

function buildOwnEngineTemplatePrompt(template: Template): {
  prompt: string;
  buildIntent: "template" | "app";
  categoryId: string;
  categoryTitle: string;
} {
  const categoryId = getTemplateCategoryId(template);
  const categoryTitle = getTemplateCategoryTitle(template);
  const catalogItem = getTemplateCatalogItemById(template.id);
  const buildIntent = catalogItem?.buildIntent === "app" ? "app" : "template";
  const categoryHint =
    TEMPLATE_CATEGORY_HINTS[categoryId] ??
    "Gor detta till en stark, sammanhallen startmall med riktig copy och tydlig visuell identitet.";

  const prompt = [
    `Create a polished ${buildIntent === "app" ? "web app" : "website"} starter inspired by the template "${template.title}".`,
    `Template category: ${categoryTitle}.`,
    categoryHint,
    "This is a template-init flow. Start from a strong scaffold and produce a complete, brandable starter that already feels intentional.",
    "Use real, specific copy and avoid placeholders like Lorem ipsum, Butiksnamn, Kategori 1, CTA, or Coming Soon.",
    "Do not clone vendor-specific markup verbatim and do not mention v0 anywhere in the generated code.",
  ].join("\n\n");

  return {
    prompt,
    buildIntent,
    categoryId,
    categoryTitle,
  };
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
      source: "template-init:own-engine",
      templateId,
      templateTitle,
      templateCategoryId,
      templateCategoryTitle,
      templateBuildIntent,
    },
  });
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
      const { templateId, quality = "max", skipCache = false } = body as {
        templateId?: string;
        quality?: QualityLevel;
        skipCache?: boolean;
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

      if (!skipCache) {
        const cached = await getCachedTemplate(templateId, userId);
        if (cached) {
          const engineChat = await getEngineChatByIdForRequest(request, cached.chat_id, {
            sessionId,
          });
          if (engineChat) {
            const files = parseCachedTemplateFiles(cached.files_json);
            const effectiveProjectId = resolvedRequestedProjectId ?? engineChat.project_id ?? null;

            if (effectiveProjectId) {
              await persistTemplateProjectData({
                projectId: effectiveProjectId,
                chatId: engineChat.id,
                demoUrl: cached.demo_url ?? null,
                currentCode:
                  findMainTemplateFile(files ?? [])?.content ??
                  cached.code ??
                  "",
                files,
                templateId: templateId,
                templateTitle: templateMeta.title,
                templateCategoryId: getTemplateCategoryId(templateMeta),
                templateCategoryTitle: getTemplateCategoryTitle(templateMeta),
                templateBuildIntent:
                  getTemplateCatalogItemById(templateId)?.buildIntent === "app"
                    ? "app"
                    : "template",
              });
            }

            return attachSessionCookie(
              NextResponse.json({
                success: true,
                message: "Laddad från cache!",
                code: cached.code || findMainTemplateFile(files ?? [])?.content || "",
                files,
                chatId: engineChat.id,
                projectId: effectiveProjectId,
                ...previewUrlField(cached.demo_url ?? null),
                model: cached.model,
                cached: true,
              }),
            );
          }
        }
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

      const templatePrompt = buildOwnEngineTemplatePrompt(templateMeta);
      const generated = await generateOwnEngineSiteFromPrompt({
        prompt: templatePrompt.prompt,
        projectId,
        buildIntent: templatePrompt.buildIntent,
        modelId: QUALITY_TO_MODEL[quality] ?? QUALITY_TO_MODEL.max,
        scaffoldMode: "auto",
        runtimeMode: "preview",
        thinking: true,
        imageGenerations: true,
      });

      const files = toLegacyTemplateFiles(generated.files);
      const mainCode = findMainTemplateFile(files)?.content || generated.contentForVersion;
      const effectiveDemoUrl = generated.runtimeUrl ?? generated.previewUrl ?? null;

      await persistTemplateProjectData({
        projectId,
        chatId: generated.chatId,
        demoUrl: effectiveDemoUrl,
        currentCode: generated.contentForVersion,
        files,
        templateId: templateId,
        templateTitle: templateMeta.title,
        templateCategoryId: templatePrompt.categoryId,
        templateCategoryTitle: templatePrompt.categoryTitle,
        templateBuildIntent: templatePrompt.buildIntent,
      });

      try {
        await cacheTemplateResult(
          templateId,
          {
            chatId: generated.chatId,
            demoUrl: effectiveDemoUrl,
            versionId: generated.versionId,
            files,
            code: mainCode,
            model: generated.model,
          },
          userId,
        );
      } catch (cacheError) {
        console.warn("[API /template] Failed to cache own-engine result:", cacheError);
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
          code: mainCode,
          files,
          chatId: generated.chatId,
          projectId,
          ...previewUrlField(effectiveDemoUrl),
          model: generated.model,
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

      // For generation API errors (500, 502, etc.), pass through the user-friendly message
      if (
        errorMessage.includes("generation API") ||
        errorMessage.includes("Generation produced no content") ||
        errorMessage.includes("tillfällig")
      ) {
        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
          },
          { status: 502 },
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
