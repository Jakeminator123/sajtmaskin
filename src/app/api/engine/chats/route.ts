import {
  handleEngineChatsGet,
  handleEngineChatsPostNotCodegen,
} from "@/lib/api/engine/chats/chats-http";

export const GET = handleEngineChatsGet;
/** Listing only. Codegen is POST /api/engine/chats/stream (`maxDuration = 950`). */
export const POST = handleEngineChatsPostNotCodegen;
