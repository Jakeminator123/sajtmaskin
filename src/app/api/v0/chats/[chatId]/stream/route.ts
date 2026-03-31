/**
 * Legacy `/api/v0/...` compat — implementation lives in `@/lib/api/engine/chats/chat-message-stream-post`.
 */
export {
  POST,
  handleMessageStreamRequest,
} from "@/lib/api/engine/chats/chat-message-stream-post";

export const runtime = "nodejs";
/** Server stream ceiling (seconds). Client-side stream safety timeout is separate — see lib handler comment. */
export const maxDuration = 800;
