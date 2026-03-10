/**
 * Chat messaging hooks — shared infrastructure for all chat engines.
 *
 * Handles both the own engine (OpenAI direct) and the v0 Platform API
 * fallback. The server route `/api/v0/chats/stream` decides which engine
 * to use. These client-side hooks are engine-agnostic.
 */

export { useChatMessaging } from "./useChatMessaging";
export type {
  ChatMessagingParams,
  ChatMessagingReturn,
  ChatAttachment,
  MessageOptions,
  AutoFixPayload,
} from "./types";
