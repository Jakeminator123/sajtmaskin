export {
  writeCreateChatLock,
  clearCreateChatLock,
  getActiveCreateChatLock,
  updateCreateChatLockChatId,
} from "./helpers-create-chat-lock";

export type { CreateChatKeyJobFields } from "./helpers-create-chat-key";
export { hashString, buildCreateChatKey } from "./helpers-create-chat-key";

export { mergeStreamingText } from "./helpers-streaming-text";

export {
  initStreamStats,
  recordStreamText,
  recordStreamParts,
  finalizeStreamStats,
} from "./helpers-stream-stats";

export { appendAttachmentPrompt } from "./helpers-attachments";

export {
  coerceUiParts,
  mergeUiParts,
  appendToolPartToMessage,
} from "./helpers-ui-parts";

export {
  coerceIntegrationSignals,
  integrationSignalToToolPart,
} from "./helpers-integrations";

export {
  buildModelInfoSteps,
  appendModelInfoPart,
  buildPromptStrategySteps,
  appendPromptStrategyPart,
} from "./helpers-model-info";

export {
  buildApiErrorMessage,
  CREATE_CHAT_CONNECTION_BROKEN_MESSAGE,
  isNetworkError,
  isAbortLikeError,
  isClientInitiatedAbort,
  buildStreamErrorMessage,
} from "./helpers-errors";

export { buildAutoFixPrompt } from "./helpers-autofix-prompt";
