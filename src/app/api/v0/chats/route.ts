import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { ensureProjectForRequest } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";

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
        system,
        projectId,
        modelId = "v0-pro",
        thinking,
        imageGenerations,
        chatPrivacy,
      } = validationResult.data;

      const resolvedSystem = system?.trim() ? system : undefined;
      const resolvedThinking = typeof thinking === "boolean" ? thinking : modelId === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";

      const result = await v0.chats.create({
        message,
        ...(resolvedSystem ? { system: resolvedSystem } : {}),
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
        const v0ProjectId = chatResult?.projectId || projectId || `chat:${v0ChatId}`;

        let internalProjectId: string | null = null;
        try {
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: projectId ? `Project ${projectId}` : `Chat ${v0ChatId}`,
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
