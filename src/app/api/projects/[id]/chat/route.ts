import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/chat
 * Get the latest chat for a project
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    // Find the most recent chat for this project
    const results = await db
      .select({
        id: chats.id,
        v0ChatId: chats.v0ChatId,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .where(eq(chats.projectId, projectId))
      .orderBy(desc(chats.createdAt))
      .limit(1);

    const latestChat = results[0];

    if (!latestChat) {
      return NextResponse.json({
        success: true,
        chatId: null,
        v0ChatId: null,
        internalChatId: null,
        message: "No chat found for this project",
      });
    }

    // Builder uses v0 chat IDs for /api/v0/chats/* and /versions calls.
    // Returning the internal DB chat ID here can put the UI in a broken state.
    return NextResponse.json({
      success: true,
      chatId: latestChat.v0ChatId,
      v0ChatId: latestChat.v0ChatId,
      internalChatId: latestChat.id,
    });
  } catch (error) {
    console.error("[API] Failed to get project chat:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
