import { handleEngineChatsGet, handleEngineChatsPostSync } from "@/lib/api/engine/chats/chats-http";
import { logLegacyV0ChatsHit } from "@/lib/api/engine/chats/v0-chats-compat";

export const GET = handleEngineChatsGet;

/**
 * Sync JSON create — compat wrapper; canonical implementation is `/api/engine/chats`.
 */
export async function POST(req: Request) {
  logLegacyV0ChatsHit("POST /api/v0/chats (sync JSON)");
  return handleEngineChatsPostSync(req);
}
