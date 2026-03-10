/**
 * Chat hook types — shared by both the own engine and v0 fallback.
 */
import type { ChatMessage } from "@/lib/builder/types";
import type { BuildIntent, BuildMethod } from "@/lib/builder/build-intent";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { ThemeColors } from "@/lib/builder/theme-presets";
import type { MutableRefObject } from "react";

export type RouterLike = { replace: (href: string) => void };

export type ChatAttachment = {
  type: "user_file";
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

export type MessageOptions = {
  attachments?: ChatAttachment[];
  attachmentPrompt?: string;
};

export type CreateChatLock = {
  key: string;
  createdAt: number;
  chatId?: string | null;
};

export type AutoFixPayload = {
  chatId: string;
  versionId: string;
  reasons: string[];
  meta?: Record<string, unknown>;
};

export type StreamDebugStats = {
  streamType: "create" | "send";
  assistantMessageId: string;
  startedAt: number;
  contentEvents: number;
  thinkingEvents: number;
  partsEvents: number;
  contentChars: number;
  thinkingChars: number;
  contentNoopEvents: number;
  thinkingNoopEvents: number;
  maxContentChunk: number;
  maxThinkingChunk: number;
  finalContentLength: number;
  finalThinkingLength: number;
  didReceiveDone: boolean;
  chatId?: string | null;
  versionId?: string | null;
};

export type StreamQualitySignal = {
  hasCriticalAnomaly: boolean;
  reasons: string[];
};

export type VersionEntry = {
  versionId?: string | null;
  id?: string | null;
  demoUrl?: string | null;
  createdAt?: string | null;
};

export type FileEntry = { name: string; content: string };

export type ModelInfoData = {
  modelId?: string | null;
  modelTier?: string | null;
  thinking?: boolean | null;
  imageGenerations?: boolean | null;
  chatPrivacy?: string | null;
  promptAssistProvider?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean | null;
  scaffoldId?: string | null;
  scaffoldFamily?: string | null;
};

export type IntegrationSseSignal = {
  key?: string;
  name?: string;
  provider?: string;
  status?: string;
  intent?: "install" | "connect" | "configure" | "env_vars";
  envVars?: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

export type DesignTokenSummary = {
  source: string;
  tokens: Array<{ name: string; value: string }>;
};

export type VersionErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

export type SetMessages = (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;

export type ChatMessagingParams = {
  chatId: string | null;
  setChatId: (id: string | null) => void;
  chatIdParam: string | null;
  router: RouterLike;
  appProjectId?: string | null;
  v0ProjectId?: string | null;
  selectedModelTier: ModelTier;
  enableImageGenerations: boolean;
  enableImageMaterialization?: boolean;
  enableThinking: boolean;
  chatPrivacy?: "private" | "unlisted";
  designSystemId?: string;
  systemPrompt?: string;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
  promptAssistMode?: "polish" | "rewrite" | null;
  buildIntent?: BuildIntent;
  buildMethod?: BuildMethod | null;
  scaffoldMode?: ScaffoldMode;
  scaffoldId?: string | null;
  themeColors?: ThemeColors | null;
  pendingBriefRef?: MutableRefObject<Record<string, unknown> | null>;
  mutateVersions: () => void;
  setCurrentDemoUrl: (url: string | null) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: { chatId: string; versionId?: string; demoUrl?: string }) => void;
  onV0ProjectId?: (projectId: string) => void;
  setMessages: SetMessages;
  resetBeforeCreateChat: () => void;
};

export type ChatMessagingReturn = {
  isCreatingChat: boolean;
  createNewChat: (
    initialMessage: string,
    options?: MessageOptions,
    systemPromptOverride?: string,
  ) => Promise<void>;
  sendMessage: (messageText: string, options?: MessageOptions) => Promise<void>;
  cancelActiveGeneration: () => void;
};
