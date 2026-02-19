import { cacheTemplateResult, getCachedTemplate } from "@/lib/db/services";
import { findMainFile, generateFromTemplate } from "@/lib/v0/v0-generator";
import { TEMPLATES } from "@/lib/templates/template-data";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureProjectForRequest, generateProjectName, resolveV0ProjectId } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";

// Allow 5 minutes for v0 API responses
export const maxDuration = 300;

// Fun loading messages for template initialization
const loadingMessages = [
  "Laddar template...",
  "Förbereder din design...",
  "Hämtar komponenter...",
  "Optimerar koden...",
];

function getRandomMessage() {
  return loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
}

export async function POST(request: NextRequest) {
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
    const { templateId, quality = "max", skipCache = false } = body;

    if (!templateId) {
      return attachSessionCookie(
        NextResponse.json(
          { success: false, error: "Template ID is required" },
          { status: 400 },
        ),
      );
    }

    // Validate templateId exists in our catalog (filters out placeholder "categories")
    const templateMeta = TEMPLATES.find((t) => t.id === templateId);
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

    // Get user ID for user-specific caching
    const user = await getCurrentUser(request);
    const userId = user?.id || null;

    console.log(
      "[API /template] Initializing from template:",
      templateId,
      "quality:",
      quality,
      userId ? `(user: ${userId})` : "(anonymous)",
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // CACHE CHECK: Return cached result if available (avoids duplicate v0 chats)
    // IMPORTANT: Cache is now per-user to prevent cross-user pollution
    // ═══════════════════════════════════════════════════════════════════════════
    if (!skipCache) {
      const cached = await getCachedTemplate(templateId, userId);
      if (cached) {
        console.log(
          "[API /template] Returning CACHED result for:",
          templateId,
          userId ? `(user: ${userId})` : "(anonymous)",
        );
        console.log("[API /template] Note: Using cached chatId from user-specific cache");

        // Parse cached files
        let files = null;
        if (cached.files_json) {
          try {
            files = JSON.parse(cached.files_json);
          } catch {
            console.warn("[API /template] Failed to parse cached files_json");
          }
        }

        // IMPORTANT: Return cached chatId for this user's template instance
        // This allows users to continue their own template conversations without creating new chats
        let projectId: string | null = null;
        try {
          const v0ProjectId = resolveV0ProjectId({ v0ChatId: cached.chat_id });
          const projectName = generateProjectName({ v0ChatId: cached.chat_id });
          const project = await ensureProjectForRequest({
            req: request,
            v0ProjectId,
            name: projectName,
          });
          projectId = project.id;
        } catch {
          projectId = null;
        }

        return attachSessionCookie(
          NextResponse.json({
            success: true,
            message: "Laddad från cache!",
            code: cached.code || "",
            files: files,
            chatId: cached.chat_id, // Return chatId for user's own template instance
            projectId,
            demoUrl: cached.demo_url,
            model: cached.model,
            cached: true,
          }),
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // NO CACHE: Generate from template using v0 Platform API
    // ═══════════════════════════════════════════════════════════════════════════
    const creditCheck = await prepareCredits(
      request,
      "prompt.template",
      { quality },
      { sessionId },
    );
    if (!creditCheck.ok) {
      return attachSessionCookie(creditCheck.response);
    }

    const result = await generateFromTemplate(templateId, quality);

    console.log("[API /template] Result:", {
      hasFiles: !!result.files?.length,
      filesCount: result.files?.length,
      hasChatId: !!result.chatId,
      hasDemoUrl: !!result.demoUrl,
    });

    // Validate that we got useful content
    const hasFiles = result.files && result.files.length > 0;
    const hasDemoUrl = !!result.demoUrl;

    if (!hasFiles && !hasDemoUrl) {
      console.error("[API /template] No content received from generation API");
      return attachSessionCookie(
        NextResponse.json(
          {
            success: false,
            error: "Mallen kunde inte laddas. Generationstjänsten returnerade inget innehåll.",
          },
          { status: 502 },
        ),
      );
    }

    // Find the main code file using shared helper
    const mainFile = hasFiles ? findMainFile(result.files!) : undefined;
    const mainCode = mainFile?.content || "";

    // ═══════════════════════════════════════════════════════════════════════════
    // CACHE RESULT: Save to database for future requests (per-user cache)
    // ═══════════════════════════════════════════════════════════════════════════
    let projectId: string | null = null;
    if (result.chatId) {
      try {
        const v0ProjectId = resolveV0ProjectId({ v0ChatId: result.chatId });
        const projectName = generateProjectName({ v0ChatId: result.chatId });
        const project = await ensureProjectForRequest({
          req: request,
          v0ProjectId,
          name: projectName,
        });
        projectId = project.id;
        await cacheTemplateResult(
          templateId,
          {
            chatId: result.chatId,
            demoUrl: result.demoUrl,
            versionId: result.versionId,
            files: result.files,
            code: mainCode || result.code,
            model: result.model,
          },
          userId,
        );
        console.log(
          "[API /template] Cached result for:",
          templateId,
          userId ? `(user: ${userId})` : "(anonymous)",
        );
      } catch (cacheError) {
        console.warn("[API /template] Failed to cache result:", cacheError);
        // Continue anyway - caching is best-effort
      }
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
        code: mainCode || result.code,
        files: result.files,
        chatId: result.chatId,
        projectId,
        demoUrl: result.demoUrl,
        model: result.model,
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

    if (errorMessage.includes("API-nyckel") || errorMessage.includes("401")) {
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
      errorMessage.includes("v0 API") ||
      errorMessage.includes("Model API") ||
      errorMessage.includes("generation API") ||
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
}
