import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  createEngineVersionErrorLogs,
  createVersionErrorLog,
  createVersionErrorLogs,
  getTelemetryForVersion,
  updateTelemetryRecord,
} from "@/lib/db/services";
import { getChatByV0ChatIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type FeedbackBody = {
  rating: "positive" | "negative";
  categories?: string[];
  comment?: string;
};

async function resolveVersionId(chatId: string, versionId: string) {
  const byInternal = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.id, versionId)))
    .limit(1);
  if (byInternal.length > 0) return byInternal[0];
  const byV0 = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.v0VersionId, versionId)))
    .limit(1);
  return byV0[0] ?? null;
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;

    const body = (await request.json().catch(() => null)) as FeedbackBody | null;
    if (!body || (body.rating !== "positive" && body.rating !== "negative")) {
      return NextResponse.json(
        { error: "Missing or invalid rating" },
        { status: 400 },
      );
    }

    const { rating, categories = [], comment } = body;

    if (!shouldUseV0Fallback()) {
      const scopedVersion = await getEngineVersionForChatByIdForRequest(
        request,
        chatId,
        versionId,
      );
      if (!scopedVersion) {
        return NextResponse.json({ error: "Version not found" }, { status: 404 });
      }
      const internalChatId = scopedVersion.chat.id;
      const internalVersionId = scopedVersion.version.id;

      const records = await getTelemetryForVersion(internalVersionId);
      if (records.length > 0) {
        await updateTelemetryRecord(records[0].id, {
          userFeedback: JSON.stringify({ rating, categories, comment }),
        });
      }

      const message =
        rating === "positive"
          ? "Användaren markerade resultatet som bra."
          : `Användaren markerade problemkategorier: ${Array.isArray(categories) ? categories.join(", ") : ""}`;

      await createEngineVersionErrorLogs([
        {
          chatId: internalChatId,
          versionId: internalVersionId,
          level: rating === "positive" ? "info" : "warning",
          category: "user-feedback",
          message,
          meta: { rating, categories, comment },
        },
      ]);

      return NextResponse.json({ success: true });
    }

    const chat = await getChatByV0ChatIdForRequest(request, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const version = await resolveVersionId(chat.id, versionId);
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const records = await getTelemetryForVersion(version.id);
    if (records.length > 0) {
      await updateTelemetryRecord(records[0].id, {
        userFeedback: JSON.stringify({ rating, categories, comment }),
      });
    }

    const message =
      rating === "positive"
        ? "Användaren markerade resultatet som bra."
        : `Användaren markerade problemkategorier: ${Array.isArray(categories) ? categories.join(", ") : ""}`;

    await createVersionErrorLogs([
      {
        chatId: chat.id,
        versionId: version.id,
        v0VersionId: version.v0VersionId,
        level: rating === "positive" ? "info" : "warning",
        category: "user-feedback",
        message,
        meta: { rating, categories, comment },
      },
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Failed to store version feedback:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
