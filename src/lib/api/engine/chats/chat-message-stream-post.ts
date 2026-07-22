/**
 * Facade for the follow-up chat stream handler. The implementation lives in
 * `./chat-message-stream/` (handler + extracted phase/turn modules); this
 * module keeps the original import path stable for
 * `src/app/api/engine/chats/[chatId]/stream/route.ts` and other consumers.
 */
export {
  handleMessageStreamRequest,
  POST,
} from "./chat-message-stream/handler";
