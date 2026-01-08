/**
 * AI Elements Components
 *
 * Modern chat UI components based on Vercel AI Elements specification.
 * Designed for React 19 and Tailwind CSS 4.
 *
 * @see https://ai-sdk.dev/docs/ai-elements
 */

// Conversation container
export {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  useConversation,
  type ConversationProps,
  type ConversationContentProps,
  type ConversationScrollButtonProps,
} from "./conversation";

// Message components
export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
  MessageTimestamp,
  type MessageProps,
  type MessageRole,
  type MessageAvatarProps,
  type MessageContentProps,
  type MessageResponseProps,
  type MessageActionsProps,
  type MessageActionProps,
  type MessageTimestampProps,
} from "./message";

// Prompt input
export {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionAddAttachments,
  type PromptInputProps,
  type PromptInputMessage,
  type PromptInputHeaderProps,
  type PromptInputBodyProps,
  type PromptInputTextareaProps,
  type PromptInputSubmitProps,
  type PromptInputFooterProps,
  type PromptInputToolsProps,
  type PromptInputAttachmentsProps,
  type PromptInputAttachmentProps,
  type PromptInputActionAddAttachmentsProps,
} from "./prompt-input";

// Reasoning (thinking display)
export {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
  type ReasoningProps,
  type ReasoningTriggerProps,
  type ReasoningContentProps,
} from "./reasoning";

// Loader
export { Loader, type LoaderProps } from "./loader";

// Web Preview (for v0-generated sites)
export {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
  WebPreviewBody,
  WebPreviewConsole,
  type WebPreviewProps,
  type WebPreviewNavigationProps,
  type WebPreviewNavigationButtonProps,
  type WebPreviewUrlProps,
  type WebPreviewBodyProps,
  type WebPreviewConsoleProps,
} from "./web-preview";
