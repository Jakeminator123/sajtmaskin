"use client";

import type { DomainSearchResult } from "@/components/builder/DomainSearchDialog";
import type { ChatMessage } from "@/lib/builder/types";
import {
  resolveBuildIntentWithScaffold,
  type BuildIntent,
  type BuildMethod,
} from "@/lib/builder/build-intent";
import { deriveBuilderEntryState } from "./builder-entry";
import type { ScaffoldMode } from "@/lib/gen/scaffolds/types";
import {
  getDefaultPaletteState,
  type PaletteState,
} from "@/lib/builder/palette";
import { DEFAULT_DESIGN_THEME, getThemeColors, type DesignTheme } from "@/lib/builder/theme-presets";
import {
  DEFAULT_IMAGE_GENERATIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  DEFAULT_SCAFFOLD_ID,
  DEFAULT_SCAFFOLD_MODE,
  DEFAULT_THINKING,
  getDefaultCustomInstructions,
  isDefaultCustomInstructions,
  getDefaultPromptAssistModel,
} from "@/lib/builder/defaults";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export function useBuilderState(searchParams: ReadonlyURLSearchParams) {
  const entry = deriveBuilderEntryState(searchParams);
  const {
    chatIdParam,
    promptParam,
    promptId,
    projectParam,
    templateId,
    source,
    buildIntentParam,
    buildMethodParam,
    hasEntryParams,
    isAuditEntry,
  } = entry;

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  // Versionspanelen är infälld som standard — användaren fäller ut vid behov.
  const [isVersionPanelCollapsed, setIsVersionPanelCollapsed] = useState(true);
  const [buildIntent, setBuildIntent] = useState<BuildIntent>(() =>
    buildIntentParam,
  );
  const [buildMethod, setBuildMethod] = useState<BuildMethod | null>(
    () => buildMethodParam,
  );
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>(DEFAULT_MODEL_TIER);
  const [promptAssistModel, setPromptAssistModel] = useState(() => getDefaultPromptAssistModel());
  const [promptAssistDeep, setPromptAssistDeep] = useState(DEFAULT_PROMPT_ASSIST.deep);
  const [promptAssistMode, setPromptAssistMode] = useState<"polish" | "rewrite" | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(DEFAULT_IMAGE_GENERATIONS);
  const [enableThinking, setEnableThinking] = useState(DEFAULT_THINKING);
  const [chatPrivacy, setChatPrivacy] = useState<"private" | "unlisted">("private");
  const [enableBlobMedia, setEnableBlobMedia] = useState(true);
  const [isImageGenerationsSupported, setIsImageGenerationsSupported] = useState(true);
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);
  // Internal Sajtmaskin brand/theme preset used by the own engine.
  const [designTheme, setDesignTheme] = useState<DesignTheme>(DEFAULT_DESIGN_THEME);
  const pendingBriefRef = useRef<Record<string, unknown> | null>(null);
  const [showStructuredChat, setShowStructuredChat] = useState(false);
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [applyInstructionsOnce, setApplyInstructionsOnce] = useState(false);
  const featureWarnedRef = useRef({ imageGen: false, blob: false });
  const hasLoadedInstructions = useRef(false);
  const pendingInstructionsRef = useRef<string | null>(null);
  const hasLoadedInstructionsOnce = useRef(false);
  const pendingInstructionsOnceRef = useRef<boolean | null>(null);
  const autoProjectInitRef = useRef(false);
  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== "audit");
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [entryIntentActive, setEntryIntentActive] = useState(
    hasEntryParams && !isAuditEntry ? Boolean(promptParam || promptId) : isAuditEntry,
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
  const [externalProjectId, setExternalProjectId] = useState<string | null>(null);
  const filesContextKeyRef = useRef<string | null>(null);
  // Raw page code for section analysis in component picker
  const [currentPageCode, setCurrentPageCode] = useState<string | undefined>(undefined);
  const [existingUiComponents, setExistingUiComponents] = useState<string[]>([]);
  const [serverProjectChatId, setServerProjectChatId] = useState<string | null>(null);
  const [serverProjectMessages, setServerProjectMessages] = useState<ChatMessage[]>([]);
  const [serverProjectDemoUrl, setServerProjectDemoUrl] = useState<string | null>(null);
  const [serverProjectPreviewOverrideUrl, setServerProjectPreviewOverrideUrl] =
    useState<string | null>(null);
  const [serverProjectPreviewOverrideVersionId, setServerProjectPreviewOverrideVersionId] =
    useState<string | null>(null);
  const [clearedPreviewVersionId, setClearedPreviewVersionId] = useState<string | null>(null);
  const lastActiveVersionIdRef = useRef<string | null>(null);
  const promptFetchInFlightRef = useRef<string | null>(null);
  const promptFetchDoneRef = useRef<string | null>(null);
  const loadedGenerationSettingsChatRef = useRef<string | null>(null);
  const applyingGenerationSettingsRef = useRef(false);
  const templateInitAttemptKeyRef = useRef<string | null>(null);

  const [scaffoldMode, setScaffoldMode] = useState<ScaffoldMode>(DEFAULT_SCAFFOLD_MODE);
  const [scaffoldId, setScaffoldId] = useState<string | null>(DEFAULT_SCAFFOLD_ID);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- refresh defaults when scaffold mode changes */
    setCustomInstructions((prev) => {
      if (!isDefaultCustomInstructions(prev)) return prev;
      return getDefaultCustomInstructions(scaffoldMode);
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [scaffoldMode]);

  const effectiveThinking = enableThinking;
  const resolvedBuildIntent = useMemo(
    () => resolveBuildIntentWithScaffold(buildMethod, buildIntent, scaffoldMode, scaffoldId),
    [buildMethod, buildIntent, scaffoldMode, scaffoldId],
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
    entry,
    buildIntentParam,
    buildMethodParam,
    hasEntryParams,
    chatId,
    setChatId,
    currentPreviewUrl,
    setCurrentPreviewUrl,
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
    promptAssistMode,
    setPromptAssistMode,
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
    externalProjectId,
    setExternalProjectId,
    filesContextKeyRef,
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
    serverProjectPreviewOverrideUrl,
    setServerProjectPreviewOverrideUrl,
    serverProjectPreviewOverrideVersionId,
    setServerProjectPreviewOverrideVersionId,
    clearedPreviewVersionId,
    setClearedPreviewVersionId,
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
    effectiveThinking,
    resolvedBuildIntent,
    themeColors,
  };
}
