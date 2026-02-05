import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { z } from "zod/v4";
import { ensureProjectForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { getVercelTemplateById } from "@/lib/templates/template-data";
import { prepareCredits } from "@/lib/credits/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const initVercelTemplateSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  message: z.string().optional(),
  projectId: z.string().optional(),
});

/**
 * Initialize a chat from a Vercel template (GitHub repo)
 *
 * This endpoint uses the v0 Platform API to initialize a chat from
 * a GitHub repository (the Vercel template's source).
 *
 * Flow:
 * 1. Look up template by ID from vercel-templates.json
 * 2. Call v0.chats.init() with type: 'repo' and the template's repoUrl
 * 3. Save the chat and version to the database
 * 4. Return chat data with internalChatId and projectId
 */
export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };

  return withRateLimit(req, "chat:create", async () => {
    try {
      assertV0Key();

      const body = await req.json().catch(() => ({}));

      const validationResult = initVercelTemplateSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const { templateId, message, projectId } = validationResult.data;

      // Look up the Vercel template
      const template = getVercelTemplateById(templateId);
      if (!template) {
        return attachSessionCookie(
          NextResponse.json({ error: `Vercel template not found: ${templateId}` }, { status: 404 }),
        );
      }

      const creditCheck = await prepareCredits(
        req,
        "prompt.vercelTemplate",
        { modelId: "v0-pro" },
        { sessionId },
      );
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      // Initialize from the GitHub repo using v0 Platform API
      const initParams: any = {
        type: "repo",
        repo: {
          url: template.repoUrl,
        },
        ...(projectId ? { projectId } : {}),
        ...(message ? { message } : {}),
      };

      const result = await (v0.chats as any).init(initParams);

      // Save to database
      let internalChatId: string | null = null;
      let internalProjectId: string | null = null;

      try {
        internalChatId = nanoid();
        const chatResult = "id" in result ? result : null;
        const v0ProjectId =
          (chatResult && "projectId" in chatResult ? chatResult.projectId : null) ||
          projectId ||
          "";

        if (v0ProjectId) {
          const importName = `Vercel Template: ${template.title}`;

          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: importName,
            sessionId,
          });
          internalProjectId = project.id;
        }

        if (chatResult && "id" in chatResult) {
          await db.insert(chats).values({
            id: internalChatId,
            v0ChatId: chatResult.id,
            v0ProjectId,
            projectId: internalProjectId,
            webUrl: ("webUrl" in chatResult ? chatResult.webUrl : null) || null,
          });

          const latestVersion = (chatResult as any).latestVersion;
          if (latestVersion) {
            const versionId = latestVersion.id || latestVersion.versionId;
            const demoUrl = latestVersion.demoUrl || latestVersion.demo_url || null;

            if (versionId) {
              await db.insert(versions).values({
                id: nanoid(),
                chatId: internalChatId,
                v0VersionId: versionId,
                v0MessageId: latestVersion.messageId || null,
                demoUrl: demoUrl,
                metadata: sanitizeV0Metadata(latestVersion),
              });
            }
          }
        }
      } catch (dbError) {
        console.error("Failed to save Vercel template chat to database:", dbError);
      }

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge vercel template init:", error);
      }

      return attachSessionCookie(
        NextResponse.json({
          ...result,
          internalChatId,
          projectId: internalProjectId,
          source: "vercel-template",
          template: {
            id: template.id,
            title: template.title,
            framework: template.framework,
            repoUrl: template.repoUrl,
          },
        }),
      );
    } catch (err) {
      console.error("Init Vercel template error:", err);
      return attachSessionCookie(
        NextResponse.json(
          { error: err instanceof Error ? err.message : "Unknown error" },
          { status: 500 },
        ),
      );
    }
  });
}
