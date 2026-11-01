import { NextResponse } from "next/server";
import { getTelemetryForVersion, updateTelemetryRecord } from "@/lib/db/services/generation-telemetry";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type FeedbackBody = {
  rating: "positive" | "negative";
  categories?: string[];
  comment?: string;
};

const MAX_FEEDBACK_CATEGORIES = 10;
const MAX_FEEDBACK_CATEGORY_LENGTH = 100;
const MAX_FEEDBACK_COMMENT_LENGTH = 2_000;

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

    if (
      body.categories !== undefined &&
      (!Array.isArray(body.categories) ||
        body.categories.length > MAX_FEEDBACK_CATEGORIES ||
        body.categories.some(
          (category) =>
            typeof category !== "string" ||
            category.trim().length === 0 ||
            category.trim().length > MAX_FEEDBACK_CATEGORY_LENGTH,
        ))
    ) {
      return NextResponse.json({ error: "Invalid categories" }, { status: 400 });
    }
    if (
      body.comment !== undefined &&
      (typeof body.comment !== "string" || body.comment.trim().length > MAX_FEEDBACK_COMMENT_LENGTH)
    ) {
      return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
    }

    const rating = body.rating;
    const categories = (body.categories ?? []).map((category) => category.trim());
    const comment = body.comment?.trim() || undefined;

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
  } catch (error) {
    console.error("[API] Failed to store version feedback:", error);
    return NextResponse.json({ error: "Failed to store version feedback" }, { status: 500 });
  }
}
