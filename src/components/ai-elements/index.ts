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

// Suggestions
export { Suggestions, Suggestion, type SuggestionsProps, type SuggestionProps } from "./suggestion";

// Sources
export {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
  type SourcesProps,
  type SourcesTriggerProps,
  type SourcesContentProps,
  type SourceProps,
} from "./sources";

// Code block
export { CodeBlock, CodeBlockCopyButton, type CodeBlockCopyButtonProps } from "./code-block";

// Tool UI
export {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolProps,
  type ToolHeaderProps,
  type ToolContentProps,
  type ToolInputProps,
  type ToolOutputProps,
} from "./tool";

// Plan UI
export {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanAction,
  PlanContent,
  PlanFooter,
  PlanTrigger,
  type PlanProps,
  type PlanHeaderProps,
  type PlanTitleProps,
  type PlanDescriptionProps,
  type PlanActionProps,
  type PlanContentProps,
  type PlanFooterProps,
  type PlanTriggerProps,
} from "./plan";

// Shimmer
export { Shimmer, type ShimmerProps } from "./shimmer";

// Advanced AI elements
export * from "./artifact";
export * from "./canvas";
export * from "./chain-of-thought";
export * from "./checkpoint";
export * from "./confirmation";
export * from "./connection";
export * from "./context";
export * from "./controls";
export * from "./edge";
export * from "./image";
export * from "./inline-citation";
export * from "./model-selector";
export * from "./node";
export * from "./open-in-chat";
export * from "./panel";
export * from "./queue";
export * from "./task";
export * from "./toolbar";

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
