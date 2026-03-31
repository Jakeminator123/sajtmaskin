import { handleEngineChatsGet, handleEngineChatsPostSync } from "@/lib/api/engine/chats/chats-http";

export const GET = handleEngineChatsGet;
export const POST = handleEngineChatsPostSync;
