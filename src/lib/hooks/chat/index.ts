/**
 * Chat messaging hooks -- shared infrastructure for all chat engines.
 *
 * This directory was previously named `v0-chat/`. Despite the legacy "V0"
 * prefixes on some types, these hooks handle ALL chat creation and streaming:
 *
 * - Own engine (OpenAI direct via OPENAI_API_KEY) -- the default
 * - v0 Platform API fallback (only when V0_FALLBACK_BUILDER=y)
 *
 * The server-side route `/api/v0/chats/stream` decides which engine to use.
 * These client-side hooks are engine-agnostic -- they parse the same SSE format.
 *
 * Preferred imports for new code:
 *   import { useChatMessaging } from "@/lib/hooks/chat";
 *   import type { ChatMessagingParams } from "@/lib/hooks/chat";
 */

export { useV0ChatMessaging, useV0ChatMessaging as useChatMessaging } from "./useV0ChatMessaging";
export type {
  V0ChatMessagingParams,
  V0ChatMessagingParams as ChatMessagingParams,
  V0ChatMessagingReturn,
  V0ChatMessagingReturn as ChatMessagingReturn,
  MessageOptions,
  V0Attachment,
  AutoFixPayload,
} from "./types";
