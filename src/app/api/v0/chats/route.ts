import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { ensureProjectForRequest, resolveV0ProjectId, generateProjectName } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog } from "@/lib/utils/debug";

export async function POST(req: Request) {
  return withRateLimit(req, "chat:create", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const validationResult = createChatSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const {
        message,
        attachments,
        projectId,
        modelId = "v0-max",
        thinking,
        imageGenerations,
        chatPrivacy,
      } = validationResult.data;

      const hasSystemPrompt =
        typeof validationResult.data.system === "string" &&
        validationResult.data.system.trim().length > 0;
      const resolvedThinking = typeof thinking === "boolean" ? thinking : modelId === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";

      debugLog("v0", "v0 chat request (sync)", {
        modelId,
        promptLength: typeof message === "string" ? message.length : null,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
        systemProvided: hasSystemPrompt,
        systemIgnored: hasSystemPrompt,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        chatPrivacy: resolvedChatPrivacy,
      });

      const result = await v0.chats.create({
        message,
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(modelId && { modelId }),
        ...(attachments ? { attachments } : {}),
      } as Parameters<typeof v0.chats.create>[0]);

      // Save chat and initial version to database (best-effort).
      let internalChatId: string | null = null;
      try {
        const chatResult =
          result && typeof result === "object" && "id" in result ? (result as any) : null;
        const v0ChatId: string | null = chatResult?.id || null;
        if (!v0ChatId) {
          return NextResponse.json(result);
        }

        internalChatId = nanoid();
        // Use standardized v0ProjectId resolution
        const v0ProjectId = resolveV0ProjectId({
          v0ChatId,
          chatDataProjectId: chatResult?.projectId,
          clientProjectId: projectId,
        });
        const projectName = generateProjectName({
          v0ChatId,
          clientProjectId: projectId,
        });

        let internalProjectId: string | null = null;
        try {
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: projectName,
          });
          internalProjectId = project.id;
        } catch {
          // ignore project save errors
        }

        await db.insert(chats).values({
          id: internalChatId,
          v0ChatId,
          v0ProjectId,
          projectId: internalProjectId,
          webUrl: chatResult?.webUrl || null,
        });

        const latestVersion = chatResult?.latestVersion || null;
        if (latestVersion) {
          const versionId = latestVersion.id || latestVersion.versionId;
          const demoUrl = latestVersion.demoUrl || latestVersion.demo_url || null;
          if (versionId) {
            await db.insert(versions).values({
              id: nanoid(),
              chatId: internalChatId,
              v0VersionId: versionId,
              v0MessageId: latestVersion.messageId || null,
              demoUrl,
              metadata: latestVersion,
            });
          }
        }
      } catch (dbError) {
        console.error("Failed to save chat to database:", dbError);
      }

      return NextResponse.json({
        ...result,
        internalChatId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
