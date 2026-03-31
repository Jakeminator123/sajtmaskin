import { handleCreateChatStreamPost } from "@/lib/api/engine/chats/create-chat-stream-post";
import { logLegacyV0ChatsHit } from "@/lib/api/engine/chats/v0-chats-compat";

export const runtime = "nodejs";
/** Server stream ceiling (seconds). Client stream safety timeout is separate — see `[chatId]/stream` route comment. */
export const maxDuration = 800;

export { handleCreateChatStreamPost };

export async function POST(req: Request) {
  logLegacyV0ChatsHit("POST /api/v0/chats/stream");
  return handleCreateChatStreamPost(req);
}
