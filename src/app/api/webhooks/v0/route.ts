import { NextResponse } from "next/server";
import { validateWebhookSecret, getWebhookSecret, parseWebhookEvent } from "@/lib/webhooks";
import { db } from "@/lib/db/client";
import { chats, versions, deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";

export async function POST(req: Request) {
  return withRateLimit(req, "webhook:v0", async () => {
    try {
      const secret = getWebhookSecret();
      if (!validateWebhookSecret(req, secret)) {
        console.warn("Webhook validation failed");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body = await req.json();
      const event = parseWebhookEvent(body);

      if (!event) {
        return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
      }

      switch (event.type) {
        case "chat.created":
          await handleChatCreated(event.data);
          break;
        case "message.finished":
          await handleMessageCompleted(event.data);
          break;
        case "deployment.ready":
          await handleDeploymentReady(event.data);
          break;
        case "deployment.error":
          await handleDeploymentError(event.data);
          break;
        default:
          break;
      }

      return NextResponse.json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}

async function handleChatCreated(data: any) {
  const { chatId, projectId } = data;
  if (!chatId) return;

  // Use upsert to prevent race condition - atomically insert or ignore if exists
  await db
    .insert(chats)
    .values({
      id: nanoid(),
      v0ChatId: chatId,
      v0ProjectId: projectId || "",
    })
    .onConflictDoNothing({ target: chats.v0ChatId });
}

async function handleMessageCompleted(data: any) {
  const { chatId, messageId, versionId, demoUrl } = data;
  if (!chatId || !messageId) return;

  const chat = await db.select().from(chats).where(eq(chats.v0ChatId, chatId)).limit(1);
  if (chat.length === 0) return;

  const existingVersion = await db
    .select()
    .from(versions)
    .where(eq(versions.v0MessageId, messageId))
    .limit(1);

  if (existingVersion.length === 0) {
    await db.insert(versions).values({
      id: nanoid(),
      chatId: chat[0].id,
      v0VersionId: versionId || messageId,
      v0MessageId: messageId,
      demoUrl: demoUrl || null,
      metadata: sanitizeV0Metadata(data),
    });
  } else if (demoUrl && !existingVersion[0].demoUrl) {
    await db
      .update(versions)
      .set({ demoUrl, metadata: sanitizeV0Metadata(data) })
      .where(eq(versions.id, existingVersion[0].id));
  }
}

async function handleDeploymentReady(data: any) {
  const { deploymentId, url, inspectorUrl } = data;
  if (!deploymentId) return;

  const deployment = await db
    .select()
    .from(deployments)
    .where(eq(deployments.vercelDeploymentId, deploymentId))
    .limit(1);

  if (deployment.length > 0) {
    await db
      .update(deployments)
      .set({
        status: "ready",
        url: url || deployment[0].url,
        inspectorUrl: inspectorUrl || deployment[0].inspectorUrl,
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deployment[0].id));
  }
}

async function handleDeploymentError(data: any) {
  const { deploymentId } = data;
  if (!deploymentId) return;

  const deployment = await db
    .select()
    .from(deployments)
    .where(eq(deployments.vercelDeploymentId, deploymentId))
    .limit(1);

  if (deployment.length > 0) {
    await db
      .update(deployments)
      .set({
        status: "error",
        updatedAt: new Date(),
      })
      .where(eq(deployments.id, deployment[0].id));
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "v0 webhook endpoint is ready",
  });
}
