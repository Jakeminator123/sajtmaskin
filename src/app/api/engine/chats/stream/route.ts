import { handleCreateChatStreamPost } from "@/lib/api/engine/chats/create-chat-stream-post";

export const runtime = "nodejs";
/** Server stream ceiling (seconds). Client stream safety timeout is separate — see `[chatId]/stream` route comment. */
export const maxDuration = 300;

export { handleCreateChatStreamPost };

export async function POST(req: Request) {
  return handleCreateChatStreamPost(req);
}
