"use client";

import type { DomainSearchResult } from "@/components/builder/DomainSearchDialog";
import type { ChatMessage } from "@/lib/builder/types";
import {
  normalizeBuildIntent,
  normalizeBuildMethod,
  resolveBuildIntentForMethod,
  type BuildIntent,
  type BuildMethod,
} from "@/lib/builder/build-intent";
import type { ScaffoldMode } from "@/lib/gen/scaffolds";
import {
  getDefaultPaletteState,
  type PaletteState,
} from "@/lib/builder/palette";
import { DEFAULT_DESIGN_THEME, getThemeColors, type DesignTheme } from "@/lib/builder/theme-presets";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_IMAGE_GENERATIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  DEFAULT_SCAFFOLD_ID,
  DEFAULT_SCAFFOLD_MODE,
  DEFAULT_SPEC_MODE,
  DEFAULT_THINKING,
  getDefaultPromptAssistModel,
} from "@/lib/builder/defaults";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export function useBuilderState(searchParams: ReadonlyURLSearchParams) {
  const chatIdParam = searchParams.get("chatId");
  const promptParam = searchParams.get("prompt");
  const promptId = searchParams.get("promptId");
  const projectParam = searchParams.get("project");
  const templateId = searchParams.get("templateId");
  const source = searchParams.get("source");
  const buildIntentParam = searchParams.get("buildIntent");
  const buildMethodParam = searchParams.get("buildMethod");
  const hasEntryParams = Boolean(promptParam || promptId || templateId || source === "audit");

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [currentDemoUrl, setCurrentDemoUrl] = useState<string | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isVersionPanelCollapsed, setIsVersionPanelCollapsed] = useState(false);
  const [buildIntent, setBuildIntent] = useState<BuildIntent>(() =>
    normalizeBuildIntent(buildIntentParam),
  );
  const [buildMethod, setBuildMethod] = useState<BuildMethod | null>(
    () => normalizeBuildMethod(buildMethodParam) || (source === "audit" ? "audit" : null),
  );
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>(DEFAULT_MODEL_TIER);
  const [promptAssistModel, setPromptAssistModel] = useState(
    DEFAULT_PROMPT_ASSIST.model || getDefaultPromptAssistModel(),
  );
  const [promptAssistDeep, setPromptAssistDeep] = useState(DEFAULT_PROMPT_ASSIST.deep);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(DEFAULT_IMAGE_GENERATIONS);
  const [enableThinking, setEnableThinking] = useState(DEFAULT_THINKING);
  const [chatPrivacy, setChatPrivacy] = useState<"private" | "unlisted">("private");
  const [enableBlobMedia, setEnableBlobMedia] = useState(true);
  const [isImageGenerationsSupported, setIsImageGenerationsSupported] = useState(true);
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);
  const [designTheme, setDesignTheme] = useState<DesignTheme>(DEFAULT_DESIGN_THEME);
  const [designSystemId, setDesignSystemId] = useState("");
  const [specMode] = useState(DEFAULT_SPEC_MODE);
  const pendingSpecRef = useRef<object | null>(null);
  const pendingBriefRef = useRef<Record<string, unknown> | null>(null);
  const [showStructuredChat, setShowStructuredChat] = useState(false);
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_CUSTOM_INSTRUCTIONS);
  const [applyInstructionsOnce, setApplyInstructionsOnce] = useState(false);
  const featureWarnedRef = useRef({ v0: false, blob: false });
  const hasLoadedInstructions = useRef(false);
  const pendingInstructionsRef = useRef<string | null>(null);
  const hasLoadedInstructionsOnce = useRef(false);
  const pendingInstructionsOnceRef = useRef<boolean | null>(null);
  const autoProjectInitRef = useRef(false);
  const lastSyncedInstructionsRef = useRef<{ v0ProjectId: string; instructions: string } | null>(
    null,
  );

  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== "audit");
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [entryIntentActive, setEntryIntentActive] = useState(
    Boolean(promptParam || promptId || source === "audit"),
  );
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isPreparingPrompt, setIsPreparingPrompt] = useState(false);
  const [appProjectId, setAppProjectId] = useState<string | null>(projectParam);
  const [appProjectName, setAppProjectName] = useState<string | null>(null);
  const [pendingProjectName, setPendingProjectName] = useState<string | null>(null);
  const [paletteState, setPaletteState] = useState<PaletteState>(() => getDefaultPaletteState());
  const paletteLoadedRef = useRef(false);
  const lastPaletteSavedRef = useRef<string | null>(null);
  const lastProjectIdRef = useRef<string | null>(appProjectId ?? null);
  const [deployNameDialogOpen, setDeployNameDialogOpen] = useState(false);
  const [deployNameInput, setDeployNameInput] = useState("");
  const [deployNameError, setDeployNameError] = useState<string | null>(null);
  const [domainSearchOpen, setDomainSearchOpen] = useState(false);
  const [domainManagerOpen, setDomainManagerOpen] = useState(false);
  const [domainQuery, setDomainQuery] = useState("");
  const [domainResults, setDomainResults] = useState<DomainSearchResult[] | null>(null);
  const [isDomainSearching, setIsDomainSearching] = useState(false);
  const [lastDeployVercelProjectId, setLastDeployVercelProjectId] = useState<string | null>(null);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [isDeployNameSaving, setIsDeployNameSaving] = useState(false);
  const [v0ProjectId, setV0ProjectId] = useState<string | null>(null);
  const [promptAssistContext, setPromptAssistContext] = useState<string | null>(null);
  const promptAssistContextKeyRef = useRef<string | null>(null);
  // Raw page code for section analysis in component picker
  const [currentPageCode, setCurrentPageCode] = useState<string | undefined>(undefined);
  const [existingUiComponents, setExistingUiComponents] = useState<string[]>([]);
  const [serverProjectChatId, setServerProjectChatId] = useState<string | null>(null);
  const [serverProjectMessages, setServerProjectMessages] = useState<ChatMessage[]>([]);
  const [serverProjectDemoUrl, setServerProjectDemoUrl] = useState<string | null>(null);
  const lastActiveVersionIdRef = useRef<string | null>(null);
  const promptFetchInFlightRef = useRef<string | null>(null);
  const promptFetchDoneRef = useRef<string | null>(null);
  const loadedGenerationSettingsChatRef = useRef<string | null>(null);
  const applyingGenerationSettingsRef = useRef(false);
  const templateInitAttemptKeyRef = useRef<string | null>(null);

  const [scaffoldMode, setScaffoldMode] = useState<ScaffoldMode>(DEFAULT_SCAFFOLD_MODE);
  const [scaffoldId, setScaffoldId] = useState<string | null>(DEFAULT_SCAFFOLD_ID);

  const isThinkingSupported = true;
  const effectiveThinking = enableThinking && isThinkingSupported;
  const resolvedBuildIntent = useMemo(
    () => resolveBuildIntentForMethod(buildMethod, buildIntent),
    [buildMethod, buildIntent],
  );
  const themeColors = useMemo(
    () => (buildMethod === "kostnadsfri" ? null : getThemeColors(designTheme)),
    [buildMethod, designTheme],
  );

  return {
    chatIdParam,
    promptParam,
    promptId,
    projectParam,
    templateId,
    source,
    buildIntentParam,
    buildMethodParam,
    hasEntryParams,
    chatId,
    setChatId,
    currentDemoUrl,
    setCurrentDemoUrl,
    previewRefreshToken,
    setPreviewRefreshToken,
    messages,
    setMessages,
    isImportModalOpen,
    setIsImportModalOpen,
    selectedVersionId,
    setSelectedVersionId,
    isVersionPanelCollapsed,
    setIsVersionPanelCollapsed,
    buildIntent,
    setBuildIntent,
    buildMethod,
    setBuildMethod,
    selectedModelTier,
    setSelectedModelTier,
    promptAssistModel,
    setPromptAssistModel,
    promptAssistDeep,
    setPromptAssistDeep,
    isSandboxModalOpen,
    setIsSandboxModalOpen,
    isDeploying,
    setIsDeploying,
    isSavingProject,
    setIsSavingProject,
    chatPrivacy,
    setChatPrivacy,
    enableImageGenerations,
    setEnableImageGenerations,
    enableThinking,
    setEnableThinking,
    enableBlobMedia,
    setEnableBlobMedia,
    isImageGenerationsSupported,
    setIsImageGenerationsSupported,
    isMediaEnabled,
    setIsMediaEnabled,
    designTheme,
    setDesignTheme,
    designSystemId,
    setDesignSystemId,
    specMode,
    pendingSpecRef,
    pendingBriefRef,
    showStructuredChat,
    setShowStructuredChat,
    isIntentionalReset,
    setIsIntentionalReset,
    customInstructions,
    setCustomInstructions,
    applyInstructionsOnce,
    setApplyInstructionsOnce,
    featureWarnedRef,
    hasLoadedInstructions,
    pendingInstructionsRef,
    hasLoadedInstructionsOnce,
    pendingInstructionsOnceRef,
    autoProjectInitRef,
    lastSyncedInstructionsRef,
    auditPromptLoaded,
    setAuditPromptLoaded,
    resolvedPrompt,
    setResolvedPrompt,
    entryIntentActive,
    setEntryIntentActive,
    isTemplateLoading,
    setIsTemplateLoading,
    isPreparingPrompt,
    setIsPreparingPrompt,
    appProjectId,
    setAppProjectId,
    appProjectName,
    setAppProjectName,
    pendingProjectName,
    setPendingProjectName,
    paletteState,
    setPaletteState,
    paletteLoadedRef,
    lastPaletteSavedRef,
    lastProjectIdRef,
    deployNameDialogOpen,
    setDeployNameDialogOpen,
    deployNameInput,
    setDeployNameInput,
    deployNameError,
    setDeployNameError,
    domainSearchOpen,
    setDomainSearchOpen,
    domainManagerOpen,
    setDomainManagerOpen,
    domainQuery,
    setDomainQuery,
    domainResults,
    setDomainResults,
    isDomainSearching,
    setIsDomainSearching,
    lastDeployVercelProjectId,
    setLastDeployVercelProjectId,
    activeDeploymentId,
    setActiveDeploymentId,
    isDeployNameSaving,
    setIsDeployNameSaving,
    v0ProjectId,
    setV0ProjectId,
    promptAssistContext,
    setPromptAssistContext,
    promptAssistContextKeyRef,
    currentPageCode,
    setCurrentPageCode,
    existingUiComponents,
    setExistingUiComponents,
    serverProjectChatId,
    setServerProjectChatId,
    serverProjectMessages,
    setServerProjectMessages,
    serverProjectDemoUrl,
    setServerProjectDemoUrl,
    lastActiveVersionIdRef,
    promptFetchInFlightRef,
    promptFetchDoneRef,
    loadedGenerationSettingsChatRef,
    applyingGenerationSettingsRef,
    templateInitAttemptKeyRef,
    scaffoldMode,
    setScaffoldMode,
    scaffoldId,
    setScaffoldId,
    isThinkingSupported,
    effectiveThinking,
    resolvedBuildIntent,
    themeColors,
  };
}
