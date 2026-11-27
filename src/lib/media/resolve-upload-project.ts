import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getChatProjectId } from "@/lib/db/chat-repository/chats";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import { MediaUploadPolicyError } from "@/lib/media/upload-policy-error";

export async function resolveMediaUploadProject(
  request: Request,
  userId: string,
  projectId?: string,
  chatId?: string,
): Promise<string | undefined> {
  if (!chatId) return projectId;
  const chatProjectId = await getChatProjectId(chatId.trim());
  if (!chatProjectId || (projectId && projectId !== chatProjectId)) {
    throw new MediaUploadPolicyError("Chatten hittades inte", 404);
  }

  const project = await getProjectByIdForOwner(chatProjectId, {
    userId,
    sessionId: getSessionIdFromRequest(request),
  });
  if (!project) throw new MediaUploadPolicyError("Chatten hittades inte", 404);
  return chatProjectId;
}
