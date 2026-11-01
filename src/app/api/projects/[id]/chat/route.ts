import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getProjectByIdForOwner, getProjectData } from "@/lib/db/services/projects";
import {
  getAppProjectByIdForRequest,
  getChatByIdForRequest,
  getChatByV0ChatIdForRequest,
} from "@/lib/tenant";
import {
  getChat as getEngineChat,
  listChatsByProject as listEngineChatsByProject,
  updateChatProjectId as updateEngineChatProjectId,
} from "@/lib/db/chat-repository-pg";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PROJECT_ID_CHARS = 200;

type ChatRow = {
  id: string;
  v0ChatId: string;
  createdAt: Date;
};

async function findChatFromProjectData(
  request: NextRequest,
  projectId: string,
  sessionId: string | null,
): Promise<ChatRow | null> {
  const data = await getProjectData(projectId);
  const persistedChatId =
    typeof data?.chat_id === "string" ? data.chat_id.trim() : "";
  if (!persistedChatId) return null;
  const ownerOptions = sessionId ? { sessionId } : undefined;

  // Preferred path: project_data.chat_id stores the v0 chat ID.
  const byV0ChatId = await getChatByV0ChatIdForRequest(request, persistedChatId, ownerOptions);
  if (byV0ChatId) return byV0ChatId;

  // Legacy fallback: older rows may have stored the internal DB chat ID.
  const byInternalId = await getChatByIdForRequest(request, persistedChatId, ownerOptions);
  if (byInternalId) return byInternalId;

  const engineChat = await getEngineChat(persistedChatId);
  if (engineChat) {
    if (engineChat.project_id !== projectId) {
      // Cross-tenant guard (P11): the persisted chat_id could have been set to
      // another tenant's engine chat (the /save reference is attacker-supplied).
      // Only self-heal drift WITHIN the same owner — never remap a chat the
      // caller does not own, which would steal it into the caller's project.
      const currentProjectId =
        typeof engineChat.project_id === "string" ? engineChat.project_id.trim() : "";
      const ownsCurrent = currentProjectId
        ? Boolean(await getAppProjectByIdForRequest(request, currentProjectId, ownerOptions))
        : false; // unverifiable (no current project) → refuse to remap
      if (!ownsCurrent) {
        console.warn("[API/projects/:id/chat] Refusing cross-tenant chat remap", {
          projectId,
          persistedChatId,
          engineProjectId: engineChat.project_id,
        });
        return null;
      }
      console.warn("[API/projects/:id/chat] Restoring engine chat mapping", {
        projectId,
        persistedChatId,
        engineProjectId: engineChat.project_id,
      });
      try {
        await updateEngineChatProjectId(engineChat.id, projectId);
      } catch (error) {
        console.warn("[API/projects/:id/chat] Failed to repair engine chat project mapping", {
          projectId,
          persistedChatId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      id: engineChat.id,
      v0ChatId: engineChat.id,
      createdAt: new Date(engineChat.created_at),
    };
  }

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
    if (!projectId || projectId.length > MAX_PROJECT_ID_CHARS) {
      return NextResponse.json({ success: false, error: "Invalid project ID" }, { status: 400 });
    }
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(projectId, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      // Builder bootstrap calls this on every load — when the project
      // either doesn't exist or isn't owned by the current
      // user/session, return the same shape we'd send for "no chat
      // yet" instead of a 404. The client only branches on `chatId`,
      // so a 200 with `chatId: null` keeps the bootstrap quiet (no
      // console-noise 404) and behaves identically downstream.
      return NextResponse.json({
        success: true,
        chatId: null,
        internalChatId: null,
        message: "Project not found or not accessible",
      });
    }

    // Preferred restore source for app projects.
    const chatFromProjectData = await findChatFromProjectData(request, projectId, sessionId);
    if (chatFromProjectData) {
      return NextResponse.json({
        success: true,
        chatId: chatFromProjectData.v0ChatId,
        internalChatId: chatFromProjectData.id,
      });
    }

    const latestChat = (await listEngineChatsByProject(projectId))[0];
    if (!latestChat) {
      return NextResponse.json({
        success: true,
        chatId: null,
        internalChatId: null,
        message: "No chat found for this project",
      });
    }

    return NextResponse.json({
      success: true,
      chatId: latestChat.id,
      internalChatId: latestChat.id,
    });
  } catch (error) {
    console.error("[API] Failed to get project chat:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get project chat",
      },
      { status: 500 },
    );
  }
}
