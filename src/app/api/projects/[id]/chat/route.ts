import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getProjectByIdForOwner, getProjectData } from "@/lib/db/services";

interface RouteParams {
  params: Promise<{ id: string }>;
}

type ChatRow = {
  id: string;
  v0ChatId: string;
  createdAt: Date;
};

async function findChatFromProjectData(projectId: string): Promise<ChatRow | null> {
  const data = await getProjectData(projectId);
  const persistedChatId =
    typeof data?.chat_id === "string" ? data.chat_id.trim() : "";
  if (!persistedChatId) return null;

  // Preferred path: project_data.chat_id stores the v0 chat ID.
  const byV0ChatId = await db
    .select({
      id: chats.id,
      v0ChatId: chats.v0ChatId,
      createdAt: chats.createdAt,
    })
    .from(chats)
    .where(eq(chats.v0ChatId, persistedChatId))
    .limit(1);
  if (byV0ChatId[0]) return byV0ChatId[0];

  // Legacy fallback: older rows may have stored the internal DB chat ID.
  const byInternalId = await db
    .select({
      id: chats.id,
      v0ChatId: chats.v0ChatId,
      createdAt: chats.createdAt,
    })
    .from(chats)
    .where(eq(chats.id, persistedChatId))
    .limit(1);
  if (byInternalId[0]) return byInternalId[0];

  console.warn("[API/projects/:id/chat] Saved chat reference not found", {
    projectId,
    persistedChatId,
  });
  return null;
}

/**
 * GET /api/projects/[id]/chat
 * Get the latest chat for a project
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(projectId, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Preferred restore source for app projects.
    const chatFromProjectData = await findChatFromProjectData(projectId);
    if (chatFromProjectData) {
      return NextResponse.json({
        success: true,
        chatId: chatFromProjectData.v0ChatId,
        v0ChatId: chatFromProjectData.v0ChatId,
        internalChatId: chatFromProjectData.id,
      });
    }

    // Fallback for legacy mappings where chats.projectId happened to match.
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
