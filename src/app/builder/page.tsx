"use client";

import { ChatInterface } from "@/components/builder/ChatInterface";
import type { ShadcnBlockSelection } from "@/components/builder/ShadcnBlockPicker";
import { ErrorBoundary } from "@/components/builder/ErrorBoundary";
import { InitFromRepoModal } from "@/components/builder/InitFromRepoModal";
import { MessageList } from "@/components/builder/MessageList";
import { PreviewPanel } from "@/components/builder/PreviewPanel";
import { SandboxModal } from "@/components/builder/SandboxModal";
import { VersionHistory } from "@/components/builder/VersionHistory";
import { BuilderHeader } from "@/components/builder/BuilderHeader";
import { IntegrationStatusPanel } from "@/components/builder/IntegrationStatusPanel";
import { ProjectEnvVarsPanel } from "@/components/builder/ProjectEnvVarsPanel";
import { DeployNameDialog } from "@/components/builder/DeployNameDialog";
import { DomainSearchDialog, type DomainSearchResult } from "@/components/builder/DomainSearchDialog";
import type { V0UserFileAttachment } from "@/components/media";
import { clearPersistedMessages } from "@/lib/builder/messagesStorage";
import type { ChatMessage, InspectorSelection } from "@/lib/builder/types";
import { buildPromptAssistContext, briefToSpec, promptToSpec } from "@/lib/builder/promptAssistContext";
import {
  buildPaletteInstruction,
  getDefaultPaletteState,
  mergePaletteSelection,
  normalizePaletteState,
  type PaletteSelection,
  type PaletteState,
} from "@/lib/builder/palette";
import { getThemeColors, normalizeDesignTheme } from "@/lib/builder/theme-presets";
import {
  normalizeBuildIntent,
  normalizeBuildMethod,
  resolveBuildIntentForMethod,
  type BuildIntent,
  type BuildMethod,
} from "@/lib/builder/build-intent";
import { createProject, getProject, saveProjectData, updateProject } from "@/lib/project-client";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_IMAGE_GENERATIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  DEFAULT_SPEC_MODE,
  DEFAULT_THINKING,
  ENABLE_EXPERIMENTAL_MODEL_ID,
  SPEC_FILE_INSTRUCTION,
  getDefaultPromptAssistModel,
  MODEL_TIER_OPTIONS,
} from "@/lib/builder/defaults";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptAssist } from "@/lib/hooks/usePromptAssist";
import { useV0ChatMessaging } from "@/lib/hooks/useV0ChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useAuth, useAuthStore } from "@/lib/auth/auth-store";
import { RequireAuthModal } from "@/components/auth";
import { formatPromptForV0, isGatewayAssistModel } from "@/lib/builder/promptAssist";
import {
  readChatGenerationSettings,
  writeChatGenerationSettings,
} from "@/lib/builder/chat-generation-settings";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { QualityLevel } from "@/lib/v0/v0-generator";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/utils/debug";
import type { ImageAssetStrategy } from "@/lib/imageAssets";
import { Loader2 } from "lucide-react";
import { ThinkingOverlay } from "@/components/builder/ThinkingOverlay";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
};

const MODEL_TIER_TO_QUALITY: Record<ModelTier, QualityLevel> = {
  "v0-mini": "light",
  "v0-pro": "standard",
  "v0-max": "max",
};

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fetchUser, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [authModalReason, setAuthModalReason] = useState<"builder" | "save" | null>(null);

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
  const [customModelId, setCustomModelId] = useState("");
  const [promptAssistModel, setPromptAssistModel] = useState(
    DEFAULT_PROMPT_ASSIST.model || getDefaultPromptAssistModel(),
  );
  const [promptAssistDeep, setPromptAssistDeep] = useState(DEFAULT_PROMPT_ASSIST.deep);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(DEFAULT_IMAGE_GENERATIONS);
  const [enableThinking, setEnableThinking] = useState(DEFAULT_THINKING);
  const [enableBlobMedia, setEnableBlobMedia] = useState(true);
  const [isImageGenerationsSupported, setIsImageGenerationsSupported] = useState(true);
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);
  const [designTheme, setDesignTheme] = useState<
    import("@/lib/builder/theme-presets").DesignTheme
  >("blue");
  const [specMode] = useState(DEFAULT_SPEC_MODE);
  const pendingSpecRef = useRef<object | null>(null);
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
  const [domainQuery, setDomainQuery] = useState("");
  const [domainResults, setDomainResults] = useState<DomainSearchResult[] | null>(null);
  const [isDomainSearching, setIsDomainSearching] = useState(false);
  const [isDeployNameSaving, setIsDeployNameSaving] = useState(false);
  const [v0ProjectId, setV0ProjectId] = useState<string | null>(null);
  const [promptAssistContext, setPromptAssistContext] = useState<string | null>(null);
  const promptAssistContextKeyRef = useRef<string | null>(null);
  // Raw page code for section analysis in component picker
  const [currentPageCode, setCurrentPageCode] = useState<string | undefined>(undefined);
  const [existingUiComponents, setExistingUiComponents] = useState<string[]>([]);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection | null>(null);
  const [inspectorClearToken, setInspectorClearToken] = useState(0);
  const lastActiveVersionIdRef = useRef<string | null>(null);
  const promptFetchInFlightRef = useRef<string | null>(null);
  const promptFetchDoneRef = useRef<string | null>(null);
  const loadedGenerationSettingsChatRef = useRef<string | null>(null);
  const applyingGenerationSettingsRef = useRef(false);
  const templateInitAttemptKeyRef = useRef<string | null>(null);

  const allowExperimentalModelId = ENABLE_EXPERIMENTAL_MODEL_ID;
  const normalizedCustomModelId = useMemo(() => customModelId.trim(), [customModelId]);
  const selectedModelId =
    allowExperimentalModelId && normalizedCustomModelId
      ? normalizedCustomModelId
      : selectedModelTier;
  const isThinkingSupported = selectedModelTier !== "v0-mini";
  const effectiveThinking = enableThinking && isThinkingSupported;
  const resolvedBuildIntent = useMemo(
    () => resolveBuildIntentForMethod(buildMethod, buildIntent),
    [buildMethod, buildIntent],
  );
  const themeColors = useMemo(
    () => (buildMethod === "kostnadsfri" ? null : getThemeColors(designTheme)),
    [buildMethod, designTheme],
  );

  useEffect(() => {
    if (!promptId) return;
    if (promptFetchDoneRef.current === promptId) return;
    if (promptFetchInFlightRef.current === promptId) return;
    promptFetchInFlightRef.current = promptId;
    let isActive = true;
    const controller = new AbortController();

    const fetchPrompt = async () => {
      let shouldClearPromptId = false;
      try {
        const response = await fetch(`/api/prompts/${encodeURIComponent(promptId)}`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          prompt?: string;
          error?: string;
          projectId?: string | null;
        } | null;
        if (!response.ok || !data?.prompt) {
          const message = data?.error || "Prompten hittades inte";
          throw new Error(message);
        }
        if (!isActive) return;
        promptFetchDoneRef.current = promptId;
        setEntryIntentActive(true);
        setResolvedPrompt(data.prompt);
        const incomingProjectId = data.projectId ?? null;
        if (incomingProjectId) {
          setAppProjectId((prev) => prev ?? incomingProjectId);
        }
        shouldClearPromptId = true;
      } catch (error) {
        if (!isActive) return;
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[Builder] Prompt handoff missing:", error);
        toast.error("Prompten hittades inte eller har redan använts.");
        setResolvedPrompt(null);
        setEntryIntentActive(false);
        promptFetchDoneRef.current = promptId;
        shouldClearPromptId = true;
      } finally {
        if (promptFetchInFlightRef.current === promptId) {
          promptFetchInFlightRef.current = null;
        }
        if (isActive) {
          setAuditPromptLoaded(true);
          if (shouldClearPromptId) {
            const nextParams = new URLSearchParams(searchParams.toString());
            nextParams.delete("promptId");
            const query = nextParams.toString();
            router.replace(query ? `/builder?${query}` : "/builder");
          }
        }
      }
    };

    void fetchPrompt();

    return () => {
      isActive = false;
      controller.abort();
      // Clear in-flight ref synchronously so a StrictMode re-mount can retry the fetch
      if (promptFetchInFlightRef.current === promptId) {
        promptFetchInFlightRef.current = null;
      }
    };
  }, [promptId, router, searchParams]);

  useEffect(() => {
    fetchUser().catch(() => {});
    // fetchUser is stable via zustand
  }, [fetchUser]);

  useEffect(() => {
    setBuildIntent(normalizeBuildIntent(buildIntentParam));
  }, [buildIntentParam]);

  useEffect(() => {
    const normalized = normalizeBuildMethod(buildMethodParam);
    if (normalized) {
      setBuildMethod(normalized);
      return;
    }
    if (source === "audit") {
      setBuildMethod("audit");
      return;
    }
    setBuildMethod(null);
  }, [buildMethodParam, source]);

  // Require authentication - show modal if not logged in after auth check completes
  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) {
      setAuthModalReason((prev) => prev ?? "builder");
      return;
    }
    setAuthModalReason(null);
  }, [isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (projectParam) {
      setAppProjectId(projectParam);
    }
  }, [projectParam]);

  // Load the latest chat for a project when project is in URL but chatId is not
  useEffect(() => {
    if (!projectParam || chatIdParam || chatId) return;
    let isActive = true;
    const controller = new AbortController();

    const loadProjectChat = async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectParam)}/chat`, {
          signal: controller.signal,
        });
        if (!res.ok || !isActive) return;
        const data = (await res.json()) as {
          chatId?: string | null;
          v0ChatId?: string | null;
          internalChatId?: string | null;
        };
        const v0ChatId =
          typeof data.v0ChatId === "string" && data.v0ChatId.trim().length > 0
            ? data.v0ChatId
            : null;

        if (v0ChatId && isActive) {
          setChatId(v0ChatId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("project", projectParam);
          params.set("chatId", v0ChatId);
          router.replace(`/builder?${params.toString()}`);
          return;
        }

        if (data.internalChatId && isActive) {
          console.warn(
            "[Builder] Skipped project chat restore because v0ChatId was missing",
            data.internalChatId,
          );
        }
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.warn("[Builder] Failed to load project chat:", error);
      }
    };

    void loadProjectChat();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [projectParam, chatIdParam, chatId, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Cleanup legacy global keys to prevent stale cross-chat leakage.
    try {
      localStorage.removeItem("sajtmaskin:aiImages");
      localStorage.removeItem("sajtmaskin:customModelId");
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:thinking");
      if (stored !== null) {
        setEnableThinking(stored === "true");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:thinking", String(enableThinking));
    } catch {
      // ignore storage errors
    }
  }, [enableThinking]);

  useEffect(() => {
    if (!allowExperimentalModelId && customModelId) {
      setCustomModelId("");
    }
  }, [allowExperimentalModelId, customModelId]);

  useEffect(() => {
    if (!chatId) {
      loadedGenerationSettingsChatRef.current = null;
      return;
    }
    if (loadedGenerationSettingsChatRef.current === chatId) {
      return;
    }
    const stored = readChatGenerationSettings(chatId);
    applyingGenerationSettingsRef.current = true;
    if (stored) {
      setSelectedModelTier(stored.modelTier);
      setCustomModelId(allowExperimentalModelId ? stored.customModelId : "");
      setEnableImageGenerations(Boolean(stored.imageGenerations));
    } else {
      writeChatGenerationSettings(chatId, {
        modelTier: selectedModelTier,
        customModelId: allowExperimentalModelId ? normalizedCustomModelId : "",
        imageGenerations: enableImageGenerations,
      });
    }
    loadedGenerationSettingsChatRef.current = chatId;
    applyingGenerationSettingsRef.current = false;
  }, [
    chatId,
    allowExperimentalModelId,
    selectedModelTier,
    normalizedCustomModelId,
    enableImageGenerations,
  ]);

  useEffect(() => {
    if (!chatId) return;
    if (applyingGenerationSettingsRef.current) return;
    if (loadedGenerationSettingsChatRef.current !== chatId) return;
    writeChatGenerationSettings(chatId, {
      modelTier: selectedModelTier,
      customModelId: allowExperimentalModelId ? normalizedCustomModelId : "",
      imageGenerations: enableImageGenerations,
    });
  }, [
    chatId,
    allowExperimentalModelId,
    selectedModelTier,
    normalizedCustomModelId,
    enableImageGenerations,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:blobImages");
      if (stored !== null) {
        setEnableBlobMedia(stored === "true");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:blobImages", String(enableBlobMedia));
    } catch {
      // ignore storage errors
    }
  }, [enableBlobMedia]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:designTheme");
      if (stored) setDesignTheme(normalizeDesignTheme(stored));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:designTheme", designTheme);
    } catch {
      // ignore
    }
  }, [designTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!appProjectId) return;
    try {
      localStorage.setItem("sajtmaskin:lastProjectId", appProjectId);
    } catch {
      // ignore storage errors
    }
  }, [appProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoProjectInitRef.current) return;
    if (appProjectId || projectParam || chatIdParam || promptId || templateId || hasEntryParams) {
      return;
    }
    autoProjectInitRef.current = true;

    let restored: string | null = null;
    try {
      restored = localStorage.getItem("sajtmaskin:lastProjectId");
    } catch {
      restored = null;
    }

    if (restored) {
      setAppProjectId(restored);
      const params = new URLSearchParams(searchParams.toString());
      params.set("project", restored);
      router.replace(`/builder?${params.toString()}`);
      return;
    }

    createProject("Untitled Project")
      .then((project) => {
        setAppProjectId(project.id);
        try {
          localStorage.setItem("sajtmaskin:lastProjectId", project.id);
        } catch {
          // ignore storage errors
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set("project", project.id);
        router.replace(`/builder?${params.toString()}`);
      })
      .catch((error) => {
        console.warn("[Builder] Auto project create failed:", error);
        autoProjectInitRef.current = false;
      });
  }, [
    appProjectId,
    projectParam,
    chatIdParam,
    promptId,
    templateId,
    hasEntryParams,
    router,
    searchParams,
  ]);

  // Sync entryIntentActive with URL params - set true when entry params exist, false when they don't.
  // This ensures "load last chat" fallback works after navigating away from an entry intent URL.
  useEffect(() => {
    const hasIntent = Boolean(promptParam || promptId || source === "audit");
    setEntryIntentActive(hasIntent);
  }, [promptParam, promptId, source]);

  // Also clear entry intent when a chat is successfully created
  useEffect(() => {
    if (chatId) {
      setEntryIntentActive(false);
    }
  }, [chatId]);

  const applyAppProjectId = useCallback(
    (nextProjectId: string | null, options: { chatId?: string | null } = {}) => {
      if (!nextProjectId) return;
      setAppProjectId((prev) => (prev === nextProjectId ? prev : nextProjectId));
      const resolvedChatId = options.chatId ?? chatId;
      if (!resolvedChatId) return;
      if (projectParam === nextProjectId && chatIdParam === resolvedChatId) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("chatId", resolvedChatId);
      params.set("project", nextProjectId);
      router.replace(`/builder?${params.toString()}`);
    },
    [chatId, chatIdParam, projectParam, router, searchParams],
  );

  useEffect(() => {
    if (!appProjectId) {
      setAppProjectName(null);
      setPaletteState(getDefaultPaletteState());
      paletteLoadedRef.current = false;
      lastPaletteSavedRef.current = null;
      lastProjectIdRef.current = null;
      return;
    }
    const previousProjectId = lastProjectIdRef.current;
    lastProjectIdRef.current = appProjectId;
    let isActive = true;
    getProject(appProjectId)
      .then((result) => {
        if (!isActive) return;
        setAppProjectName(result.project?.name ?? null);
        const nextPalette = normalizePaletteState(result.data?.meta?.palette);
        const defaultPalette = getDefaultPaletteState();
        setPaletteState((prev) => {
          const isNewProject = previousProjectId !== null && previousProjectId !== appProjectId;
          if (nextPalette.selections.length === 0) {
            if (!isNewProject && prev.selections.length > 0) {
              return prev;
            }
            return defaultPalette;
          }
          return nextPalette;
        });
        paletteLoadedRef.current = true;
      })
      .catch((error) => {
        console.warn("[Builder] Failed to load project name:", error);
        if (error instanceof Error && error.message.toLowerCase().includes("project not found")) {
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("project") === appProjectId) {
              params.delete("project");
              const query = params.toString();
              window.history.replaceState(null, "", query ? `/builder?${query}` : "/builder");
            }
          }
          setAppProjectId(null);
        }
      });
    return () => {
      isActive = false;
    };
  }, [appProjectId]);

  useEffect(() => {
    if (!appProjectId) return;
    if (!paletteLoadedRef.current) return;
    const serialized = JSON.stringify(paletteState);
    if (serialized === lastPaletteSavedRef.current) return;
    lastPaletteSavedRef.current = serialized;
    saveProjectData(appProjectId, {
      meta: { palette: paletteState },
    }).catch((error) => {
      console.warn("[Builder] Failed to persist palette state:", error);
    });
  }, [appProjectId, paletteState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("sajtmaskin:structuredChat");
      if (stored !== null) {
        setShowStructuredChat(stored === "true");
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("sajtmaskin:structuredChat", String(showStructuredChat));
    } catch {
      // ignore storage errors
    }
  }, [showStructuredChat]);

  useEffect(() => {
    const handleDialogClose = () => setDeployNameDialogOpen(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructions.current = false;
      return;
    }
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsRef.current;
    if (stored !== null) {
      setCustomInstructions(stored);
    } else if (pending) {
      const normalized = pending.trim();
      setCustomInstructions(normalized);
      try {
        localStorage.setItem(storageKey, normalized);
      } catch {
        // ignore storage errors
      }
    } else {
      setCustomInstructions("");
    }
    pendingInstructionsRef.current = null;
    hasLoadedInstructions.current = true;
  }, [chatId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructions.current) return;
    const storageKey = `sajtmaskin:chatInstructions:${chatId}`;
    const normalized = customInstructions.trim();
    try {
      if (normalized) {
        localStorage.setItem(storageKey, normalized);
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [chatId, customInstructions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!v0ProjectId || !hasLoadedInstructions.current) return;
    if (applyInstructionsOnce) return;
    const normalized = customInstructions.trim();
    const last = lastSyncedInstructionsRef.current;
    if (last && last.v0ProjectId === v0ProjectId && last.instructions === normalized) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    fetch("/api/v0/projects/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ projectId: v0ProjectId, instructions: normalized }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as unknown;
          const errorMessage =
            err && typeof err === "object" && "error" in err
              ? (err as { error?: unknown }).error
              : null;
          const msg =
            typeof errorMessage === "string"
              ? errorMessage
              : `Failed to sync project instructions (HTTP ${res.status})`;
          throw new Error(msg);
        }
        lastSyncedInstructionsRef.current = { v0ProjectId, instructions: normalized };
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("v0", "Failed to sync project instructions", {
          projectId: v0ProjectId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });
  }, [v0ProjectId, customInstructions, applyInstructionsOnce]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId) {
      hasLoadedInstructionsOnce.current = false;
      setApplyInstructionsOnce(false);
      return;
    }
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    const pending = pendingInstructionsOnceRef.current;
    if (stored !== null) {
      setApplyInstructionsOnce(stored === "true");
    } else if (pending !== null) {
      setApplyInstructionsOnce(pending);
      try {
        localStorage.setItem(storageKey, String(pending));
      } catch {
        // ignore storage errors
      }
    } else {
      setApplyInstructionsOnce(false);
    }
    pendingInstructionsOnceRef.current = null;
    hasLoadedInstructionsOnce.current = true;
  }, [chatId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!chatId || !hasLoadedInstructionsOnce.current) return;
    const storageKey = `sajtmaskin:chatInstructionsOnce:${chatId}`;
    try {
      if (applyInstructionsOnce) {
        localStorage.setItem(storageKey, "true");
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
  }, [chatId, applyInstructionsOnce]);

  const fetchHealthFeatures = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      features?: { vercelBlob?: boolean; v0?: boolean };
      featureReasons?: { vercelBlob?: string | null; v0?: string | null };
    } | null;
    return {
      blobEnabled: Boolean(data?.features?.vercelBlob),
      v0Enabled: Boolean(data?.features?.v0),
      reasons: data?.featureReasons ?? {},
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadImageStrategyDefault = async () => {
      try {
        const flags = await fetchHealthFeatures(controller.signal);
        if (!flags) return;
        const { blobEnabled, v0Enabled, reasons } = flags;
        if (!isActive) return;
        setIsMediaEnabled(blobEnabled);
        setIsImageGenerationsSupported(v0Enabled);
        if (!v0Enabled) {
          setEnableImageGenerations(false);
        }
        if (!v0Enabled && !featureWarnedRef.current.v0) {
          featureWarnedRef.current.v0 = true;
          const reason = reasons?.v0 || "AI-konfiguration saknas";
          toast.error(`Bildgenerering är avstängd: ${reason}`);
        }
        if (v0Enabled && !blobEnabled && !featureWarnedRef.current.blob) {
          featureWarnedRef.current.blob = true;
          const reason = reasons?.vercelBlob || "BLOB_READ_WRITE_TOKEN saknas";
          toast(`Blob saknas: ${reason}. Bilder kan saknas i preview.`);
        }
        debugLog("AI", "Builder feature flags resolved", {
          v0Enabled,
          blobEnabled,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    };

    loadImageStrategyDefault();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [fetchHealthFeatures]);

  useEffect(() => {
    if (!searchParams) return;
    const connected = searchParams.get("github_connected");
    const username = searchParams.get("github_username");
    const error = searchParams.get("github_error");
    const errorReason = searchParams.get("github_error_reason");

    if (!connected && !error) return;

    if (connected) {
      toast.success(username ? `GitHub kopplat: @${username}` : "GitHub kopplat");
    } else if (error) {
      const message =
        error === "not_authenticated"
          ? "Logga in för att koppla GitHub"
          : error === "not_configured"
            ? "GitHub OAuth är inte konfigurerat"
            : error === "user_fetch_failed"
              ? "Kunde inte hämta GitHub-användare"
              : error === "no_code"
                ? "GitHub gav ingen kod"
                : "GitHub-anslutning misslyckades";
      toast.error(message);
      if (errorReason === "unsafe_return") {
        console.warn("[GitHub OAuth] Unsafe return URL sanitized");
      }
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("github_connected");
    nextParams.delete("github_username");
    nextParams.delete("github_error");
    nextParams.delete("github_error_reason");
    const query = nextParams.toString();
    router.replace(query ? `/builder?${query}` : "/builder");
  }, [searchParams, router]);

  useEffect(() => {
    if (source !== "audit") return;
    if (!promptId) {
      setAuditPromptLoaded(true);
    }
  }, [source, promptId]);

  const { chat, mutate: mutateChat, isError: isChatError } = useChat(chatId);
  const chatV0ProjectId = (chat as { v0ProjectId?: string | null } | null)?.v0ProjectId ?? null;
  const isAnyStreaming = useMemo(() => messages.some((m) => Boolean(m.isStreaming)), [messages]);
  // Version polling - faster while generating
  const { versions, mutate: mutateVersions } = useVersions(chatId, {
    isGenerating: isAnyStreaming,
    pauseWhileGenerating: true,
  });

  // Handle chat not found - clear invalid chatId from state and localStorage
  useEffect(() => {
    if (!chatId || !isChatError) return;
    console.warn("[Builder] Chat not found or error loading chat:", chatId);
    toast.error("Chatten kunde inte hittas. Skapar ny session...");
    // Clear invalid chatId
    try {
      localStorage.removeItem("sajtmaskin:lastChatId");
    } catch {
      // ignore storage errors
    }
    setChatId(null);
    setCurrentDemoUrl(null);
    setMessages([]);
    router.replace("/builder");
  }, [chatId, isChatError, router]);
  type VersionSummary = {
    id?: string | null;
    versionId?: string | null;
    demoUrl?: string | null;
    createdAt?: string | Date | null;
  };
  const versionsList = useMemo(
    () => (Array.isArray(versions) ? (versions as VersionSummary[]) : []),
    [versions],
  );
  const effectiveVersionsList = useMemo(() => {
    const list = [...versionsList];
    const latest = (chat as { latestVersion?: VersionSummary } | null)?.latestVersion;
    const latestId = latest?.versionId || latest?.id || null;
    if (!latestId) return list;
    const exists = list.some(
      (version) => version.versionId === latestId || version.id === latestId,
    );
    if (exists) return list;
    list.unshift({
      versionId: latest?.versionId || latest?.id || null,
      id: latest?.id || null,
      demoUrl: latest?.demoUrl ?? null,
      createdAt: latest?.createdAt ?? new Date().toISOString(),
    });
    return list;
  }, [versionsList, chat]);

  useEffect(() => {
    if (!chatId) {
      setV0ProjectId(null);
      return;
    }
    if (chatV0ProjectId && chatV0ProjectId !== v0ProjectId) {
      setV0ProjectId(chatV0ProjectId);
    }
  }, [chatId, chatV0ProjectId, v0ProjectId]);
  const versionIdSet = useMemo(() => {
    return new Set(
      effectiveVersionsList
        .map((version) => version.versionId || version.id || null)
        .filter((versionId): versionId is string => Boolean(versionId)),
    );
  }, [effectiveVersionsList]);

  useEffect(() => {
    setSelectedVersionId(null);
    setV0ProjectId(null);
  }, [chatId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    if (!versionIdSet.has(selectedVersionId)) {
      setSelectedVersionId(null);
    }
  }, [selectedVersionId, versionIdSet]);

  useEffect(() => {
    if (isIntentionalReset) {
      if (!chatIdParam) {
        setIsIntentionalReset(false);
      }
      return;
    }

    if (chatIdParam && chatIdParam !== chatId) {
      setChatId(chatIdParam);
      return;
    }

    // NOTE: We no longer auto-load the last chatId from localStorage.
    // Each new visit to /builder should start fresh with a new project.
    // The lastChatId is still saved for reference but not auto-loaded.
    // Users can access previous chats via their project list or history.
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams, entryIntentActive]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", chatId);
    } catch {
      // ignore storage errors
    }
  }, [chatId]);

  const latestVersionId = useMemo(() => {
    // Find the most recently created version (regardless of pinned status)
    // versionsList is sorted with pinned first, so we need to find by createdAt
    type VersionWithTime = {
      versionId?: string | null;
      id?: string | null;
      createdAt?: string | Date | null;
    };
    const versionsWithTime = effectiveVersionsList as VersionWithTime[];

    // Sort by createdAt to find the truly latest version
    const sortedByTime = [...versionsWithTime].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime; // Most recent first
    });

    const latestFromVersions = sortedByTime[0]?.versionId || sortedByTime[0]?.id || null;

    const latestFromChat = (() => {
      if (!chat || typeof chat !== "object") return null;
      const latest = (chat as { latestVersion?: { versionId?: string | null; id?: string | null } })
        .latestVersion;
      return latest?.versionId || latest?.id || null;
    })();
    return latestFromVersions || latestFromChat;
  }, [effectiveVersionsList, chat]);

  const activeVersionId = selectedVersionId || latestVersionId;

  // Sync demoUrl when active version changes or demoUrl is missing
  useEffect(() => {
    if (!activeVersionId) return;

    const didChangeVersion = lastActiveVersionIdRef.current !== activeVersionId;
    lastActiveVersionIdRef.current = activeVersionId;

    if (!didChangeVersion && currentDemoUrl) return;

    const activeVersionMatch = effectiveVersionsList.find(
      (version) => version.versionId === activeVersionId || version.id === activeVersionId,
    );
    const nextDemoUrl =
      activeVersionMatch?.demoUrl ||
      chat?.demoUrl ||
      (chat as { latestVersion?: { demoUrl?: string | null } } | null)?.latestVersion?.demoUrl ||
      effectiveVersionsList[0]?.demoUrl ||
      null;

    if (nextDemoUrl && nextDemoUrl !== currentDemoUrl) {
      setCurrentDemoUrl(nextDemoUrl);
      setPreviewRefreshToken(Date.now());
    }
  }, [activeVersionId, chat, currentDemoUrl, effectiveVersionsList]);

  useEffect(() => {
    setInspectorSelection(null);
    setInspectorClearToken(Date.now());
  }, [chatId, currentDemoUrl]);

  useEffect(() => {
    const contextKey = chatId && activeVersionId ? `${chatId}:${activeVersionId}` : null;
    if (!contextKey) {
      promptAssistContextKeyRef.current = null;
      setPromptAssistContext(null);
      setExistingUiComponents([]);
      return;
    }
    if (promptAssistContextKeyRef.current === contextKey) return;
    promptAssistContextKeyRef.current = contextKey;

    let isActive = true;
    const controller = new AbortController();

    const fetchContext = async () => {
      try {
        if (!chatId || !activeVersionId) {
          if (isActive) setPromptAssistContext("");
          return;
        }
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            activeVersionId,
          )}`,
          { signal: controller.signal },
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content?: string | null }>;
        } | null;
        if (!response.ok || !Array.isArray(data?.files)) {
          if (isActive) {
            setPromptAssistContext("");
            setCurrentPageCode(undefined);
            setExistingUiComponents([]);
          }
          return;
        }
        const context = buildPromptAssistContext(data.files);
        if (isActive) setPromptAssistContext(context);

        // Extract main page code for section analysis
        // Look for page.tsx, app/page.tsx, or the main component file
        const pageFile = data.files.find(
          (f) =>
            f.name === "page.tsx" ||
            f.name === "app/page.tsx" ||
            f.name.endsWith("/page.tsx") ||
            f.name === "index.tsx" ||
            f.name === "App.tsx",
        );
        if (isActive) {
          setCurrentPageCode(pageFile?.content || undefined);
        }

        const extractUiComponentName = (fileName: string): string | null => {
          if (!fileName) return null;
          const normalized = fileName.replace(/\\/g, "/");
          const marker = "/components/ui/";
          const idx = normalized.lastIndexOf(marker);
          if (idx === -1) return null;
          const tail = normalized.slice(idx + marker.length);
          if (!tail) return null;
          const indexMatch = tail.match(/([^/]+)\/index\.(tsx|ts|jsx|js)$/);
          if (indexMatch?.[1]) return indexMatch[1];
          const base = tail.split("/").pop() || "";
          const cleaned = base.replace(/\.(tsx|ts|jsx|js)$/, "");
          return cleaned || null;
        };

        const nextUiComponents = Array.from(
          new Set(
            data.files
              .map((file) => extractUiComponentName(file.name))
              .filter((name): name is string => Boolean(name)),
          ),
        ).sort((a, b) => a.localeCompare(b));

        if (isActive) setExistingUiComponents(nextUiComponents);
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setPromptAssistContext("");
        setExistingUiComponents([]);
      }
    };

    fetchContext();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, activeVersionId]);

  const mediaEnabled = isMediaEnabled && enableBlobMedia;

  const resolveSuggestedProjectName = useCallback(() => {
    const preferred = pendingProjectName?.trim() || appProjectName?.trim();
    if (preferred) return preferred;
    const firstUserMessage = messages.find(
      (message) => message.role === "user" && typeof message.content === "string",
    );
    const base =
      firstUserMessage?.content?.trim() ||
      resolvedPrompt?.trim() ||
      (chatId ? `sajtmaskin-${chatId}` : "sajtmaskin");
    const singleLine = base.split("\n")[0]?.trim();
    return singleLine || "sajtmaskin";
  }, [pendingProjectName, appProjectName, messages, resolvedPrompt, chatId]);

  const handleOpenDeployDialog = useCallback(() => {
    setDeployNameError(null);
    setDeployNameInput(resolveSuggestedProjectName());
    setDeployNameDialogOpen(true);
  }, [resolveSuggestedProjectName]);

  const handleDomainSearch = useCallback(async () => {
    if (!domainQuery.trim()) return;
    setIsDomainSearching(true);
    setDomainResults(null);
    try {
      // Generate TLD variations if user entered a bare name
      const query = domainQuery.trim().toLowerCase();
      const hasTld = query.includes(".");
      const domains = hasTld
        ? [query]
        : [`${query}.se`, `${query}.com`, `${query}.io`, `${query}.app`, `${query}.net`];

      const results = await Promise.all(
        domains.map(async (domain) => {
          try {
            const res = await fetch(`/api/vercel/domains/price?domain=${encodeURIComponent(domain)}`);
            const data = await res.json();
            return {
              domain,
              available: data.available ?? true,
              price: data.price ?? 0,
              currency: data.currency ?? "SEK",
            };
          } catch {
            return { domain, available: false, price: 0, currency: "SEK" };
          }
        }),
      );
      setDomainResults(results);
    } catch {
      toast.error("Kunde inte söka domäner");
    } finally {
      setIsDomainSearching(false);
    }
  }, [domainQuery]);

  const deployActiveVersionToVercel = useCallback(
    async (target: "production" | "preview" = "production", projectName?: string) => {
      if (!chatId) {
        toast.error("No chat selected");
        return;
      }
      if (!activeVersionId) {
        toast.error("No version selected");
        return;
      }
      if (isDeploying) return;

      setIsDeploying(true);
      try {
        const wantsBlob = enableBlobMedia;
        const resolvedStrategy: ImageAssetStrategy =
          wantsBlob && isMediaEnabled ? "blob" : "external";
        if (wantsBlob && !isMediaEnabled) {
          toast.error("Blob storage saknas – deploy körs med externa bild-URL:er.");
        }

        const response = await fetch("/api/v0/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            versionId: activeVersionId,
            target,
            imageStrategy: resolvedStrategy,
            ...(projectName?.trim() ? { projectName: projectName.trim() } : {}),
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            data?.error || data?.message || `Deploy failed (HTTP ${response.status})`,
          );
        }

        const rawUrl = typeof data?.url === "string" ? data.url : null;
        const url = rawUrl ? (rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`) : null;

        toast.success(url ? "Deployment started (Vercel building...)" : "Deployment started");
        if (url) {
          toast(
            <span className="text-sm">
              Vercel URL:{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                {url}
              </a>
            </span>,
            { duration: 15000 },
          );
        }
      } catch (error) {
        console.error("Deploy error:", error);
        toast.error(error instanceof Error ? error.message : "Failed to deploy");
      } finally {
        setIsDeploying(false);
      }
    },
    [chatId, activeVersionId, isDeploying, isMediaEnabled, enableBlobMedia],
  );

  const handleConfirmDeploy = useCallback(async () => {
    if (isDeploying || isDeployNameSaving) return;
    const rawName = deployNameInput.trim();
    const nextName = rawName || resolveSuggestedProjectName();
    if (!nextName.trim()) {
      setDeployNameError("Ange ett projektnamn.");
      return;
    }
    setDeployNameDialogOpen(false);
    setPendingProjectName(nextName);

    if (appProjectId && nextName.trim() !== (appProjectName ?? "").trim()) {
      setIsDeployNameSaving(true);
      try {
        const updated = await updateProject(appProjectId, { name: nextName.trim() });
        setAppProjectName(updated.name);
      } catch (error) {
        console.warn("[Builder] Failed to update project name:", error);
        toast.error("Kunde inte uppdatera projektnamn.");
      } finally {
        setIsDeployNameSaving(false);
      }
    }

    await deployActiveVersionToVercel("production", nextName);
  }, [
    isDeploying,
    isDeployNameSaving,
    deployNameInput,
    resolveSuggestedProjectName,
    appProjectId,
    appProjectName,
    deployActiveVersionToVercel,
  ]);

  const { maybeEnhanceInitialPrompt, generateDynamicInstructions } = usePromptAssist({
    model: promptAssistModel,
    deep: promptAssistDeep,
    imageGenerations: enableImageGenerations,
    codeContext: promptAssistContext,
    buildIntent: resolvedBuildIntent,
    themeColors,
  });

  const handlePromptAssistModelChange = useCallback((model: string) => {
    setPromptAssistModel(model);
    if (!isGatewayAssistModel(model)) {
      setPromptAssistDeep(false);
    }
  }, []);

  const handlePromptEnhance = useCallback(
    async (message: string) => {
      const enhanced = await maybeEnhanceInitialPrompt(message, {
        forceShallow: true,
        mode: "polish",
      });
      return formatPromptForV0(enhanced);
    },
    [maybeEnhanceInitialPrompt],
  );

  const resetBeforeCreateChat = useCallback(() => {
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
  }, []);

  const bumpPreviewRefreshToken = useCallback(() => {
    setPreviewRefreshToken(Date.now());
  }, []);

  // CSS validation hook - auto-fixes Tailwind v4 issues after generation
  const { validateAndFix: validateCss } = useCssValidation({ autoFix: true, showToasts: true });

  const persistVersionErrorLogs = useCallback(
    async (
      chatId: string,
      versionId: string,
      logs: Array<{
        level: "info" | "warning" | "error";
        category?: string | null;
        message: string;
        meta?: Record<string, unknown> | null;
      }>,
    ) => {
      if (!logs.length) return;
      try {
        await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logs }),
          },
        );
      } catch (error) {
        console.warn("[Builder] Failed to persist version error logs:", error);
      }
    },
    [],
  );

  const triggerAutoFix = useCallback((payload: {
    chatId: string;
    versionId: string;
    reasons: string[];
    meta?: Record<string, unknown>;
  }) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("sajtmaskin:auto-fix", { detail: payload }));
  }, []);

  // Handle generation completion - validate CSS to prevent runtime errors
  const handleGenerationComplete = useCallback(
    async (data: { chatId: string; versionId?: string; demoUrl?: string }) => {
      const normalized = pendingInstructionsRef.current?.trim() || "";
      const shouldApplyOnce = pendingInstructionsOnceRef.current ?? applyInstructionsOnce;
      if (data.chatId) {
        if (normalized && !shouldApplyOnce) {
          try {
            localStorage.setItem(`sajtmaskin:chatInstructions:${data.chatId}`, normalized);
          } catch {
            // ignore storage errors
          }
          setCustomInstructions(normalized);
        }
        pendingInstructionsRef.current = null;
        pendingInstructionsOnceRef.current = null;
        try {
          const onceKey = `sajtmaskin:chatInstructionsOnce:${data.chatId}`;
          if (shouldApplyOnce) {
            localStorage.removeItem(onceKey);
          } else if (applyInstructionsOnce) {
            localStorage.setItem(onceKey, "true");
          } else {
            localStorage.removeItem(onceKey);
          }
        } catch {
          // ignore storage errors
        }
      }
      if (shouldApplyOnce && normalized) {
        setCustomInstructions("");
        setApplyInstructionsOnce(false);
        if (data.chatId) {
          try {
            localStorage.removeItem(`sajtmaskin:chatInstructions:${data.chatId}`);
          } catch {
            // ignore storage errors
          }
        }
        toast.success("Instruktioner användes för versionen och rensades.");
      }
      // Push spec file to v0 project if spec mode is active and we have a pending spec
      if (pendingSpecRef.current && data.chatId && data.versionId) {
        try {
          const specContent = JSON.stringify(pendingSpecRef.current, null, 2);
          pendingSpecRef.current = null;
          fetch(`/api/v0/chats/${encodeURIComponent(data.chatId)}/files`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              versionId: data.versionId,
              files: [
                {
                  name: "sajtmaskin.spec.json",
                  content: specContent,
                  locked: true,
                },
              ],
            }),
          }).catch((err) => {
            console.warn("[Spec] Failed to push spec file:", err);
          });
        } catch (err) {
          console.warn("[Spec] Failed to serialize spec:", err);
          pendingSpecRef.current = null;
        }
      }

      if (data.chatId && data.versionId) {
        const { chatId, versionId } = data;
        // Run CSS validation in background (don't block UI)
        validateCss(chatId, versionId)
          .then((result) => {
            if (!result) return;
            const errorCount = result.issues.reduce(
              (sum, file) => sum + file.issues.filter((issue) => issue.severity === "error").length,
              0,
            );
            const warningCount = result.issues.reduce(
              (sum, file) => sum + file.issues.filter((issue) => issue.severity === "warning").length,
              0,
            );
            if (errorCount > 0 || warningCount > 0) {
              const message =
                errorCount > 0
                  ? "CSS errors detected after validation."
                  : "CSS warnings detected after validation.";
              void persistVersionErrorLogs(chatId, versionId, [
                {
                  level: errorCount > 0 ? "error" : "warning",
                  category: "css",
                  message,
                  meta: {
                    errorCount,
                    warningCount,
                    fixed: Boolean(result.fixed),
                    demoUrl: result.demoUrl ?? null,
                    files: result.issues.map((file) => ({
                      fileName: file.fileName,
                      issueCount: file.issues.length,
                    })),
                  },
                },
              ]);
            }
            if (errorCount > 0 && !result.fixed) {
              triggerAutoFix({
                chatId,
                versionId,
                reasons: ["css errors"],
                meta: { errorCount, warningCount },
              });
            }
          })
          .catch((err) => {
            console.warn("[CSS Validation] Failed:", err);
            void persistVersionErrorLogs(chatId, versionId, [
              {
                level: "error",
                category: "css",
                message: "CSS validation failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        // Normalize unicode escapes in text content (best-effort)
        fetch(`/api/v0/chats/${encodeURIComponent(chatId)}/normalize-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ versionId, autoFix: true }),
        })
          .then(async (res) => {
            const payload = (await res.json().catch(() => null)) as
              | {
                  normalized?: boolean;
                  changed?: boolean;
                  changedFiles?: number;
                  replacements?: number;
                  fixed?: boolean;
                  demoUrl?: string | null;
                  error?: string;
                }
              | null;
            if (!res.ok) {
              throw new Error(payload?.error || "Unicode normalization failed");
            }
            if (payload?.changed) {
              void persistVersionErrorLogs(chatId, versionId, [
                {
                  level: "info",
                  category: "unicode",
                  message: "Unicode escapes normalized.",
                  meta: {
                    changedFiles: payload.changedFiles ?? 0,
                    replacements: payload.replacements ?? 0,
                    fixed: Boolean(payload.fixed),
                    demoUrl: payload.demoUrl ?? null,
                  },
                },
              ]);
            }
          })
          .catch((err) => {
            console.warn("[Unicode Normalize] Failed:", err);
            void persistVersionErrorLogs(chatId, versionId, [
              {
                level: "warning",
                category: "unicode",
                message: "Unicode normalization failed.",
                meta: { error: err instanceof Error ? err.message : String(err) },
              },
            ]);
          });
        // Refetch chat data to get demoUrl if stream didn't provide it
        if (!data.demoUrl) {
          setTimeout(() => {
            mutateChat();
            mutateVersions();
          }, 4000); // Allow more time for large generations
        }
      }
      if (appProjectId && data.chatId) {
        saveProjectData(appProjectId, {
          chatId: data.chatId,
          demoUrl: data.demoUrl ?? undefined,
        }).catch((error) => {
          console.warn("[Builder] Failed to save project chat mapping:", error);
        });
      }
    },
    [
      applyInstructionsOnce,
      validateCss,
      appProjectId,
      mutateChat,
      mutateVersions,
      persistVersionErrorLogs,
      triggerAutoFix,
    ],
  );

  const { isCreatingChat, createNewChat, sendMessage, cancelActiveGeneration } = useV0ChatMessaging({
    chatId,
    setChatId,
    chatIdParam,
    router,
    appProjectId,
    v0ProjectId,
    selectedModelTier,
    selectedModelId,
    enableImageGenerations,
    enableImageMaterialization: mediaEnabled,
    enableThinking: effectiveThinking,
    systemPrompt: customInstructions,
    promptAssistModel,
    promptAssistDeep,
    buildIntent: resolvedBuildIntent,
    buildMethod,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh: bumpPreviewRefreshToken,
    onGenerationComplete: handleGenerationComplete,
    onV0ProjectId: (nextProjectId) => setV0ProjectId(nextProjectId),
    setMessages,
    resetBeforeCreateChat,
  });

  const captureInstructionSnapshot = useCallback(() => {
    pendingInstructionsRef.current = customInstructions.trim() || null;
    pendingInstructionsOnceRef.current = applyInstructionsOnce;
  }, [customInstructions, applyInstructionsOnce]);

  const applyDynamicInstructionsForNewChat = useCallback(
    async (message: string): Promise<string | null> => {
      if (chatId) return null;
      const trimmed = message.trim();
      if (!trimmed) return null;
      setIsPreparingPrompt(true);
      try {
        const addendum = await generateDynamicInstructions(trimmed, {
          forceShallow: !promptAssistDeep,
          onBrief: specMode
            ? (brief) => {
                pendingSpecRef.current = briefToSpec(brief, trimmed, themeColors, paletteState);
              }
            : undefined,
        });
        // If spec mode is active but onBrief was never called (shallow path),
        // generate a minimal spec from the prompt so the file still gets pushed.
        if (specMode && !pendingSpecRef.current) {
          pendingSpecRef.current = promptToSpec(trimmed, themeColors, paletteState);
        }

        const baseInstructions =
          customInstructions.trim() &&
          customInstructions.trim() !== DEFAULT_CUSTOM_INSTRUCTIONS.trim()
            ? customInstructions.trim()
            : DEFAULT_CUSTOM_INSTRUCTIONS.trim();
        // Only reference the spec file if it was actually created
        const specSuffix = pendingSpecRef.current ? SPEC_FILE_INSTRUCTION : "";
        const paletteHint = buildPaletteInstruction(paletteState);
        const paletteSuffix = paletteHint ? `\n\n${paletteHint}` : "";
        const combined = addendum.trim()
          ? `${baseInstructions}\n\n${addendum}${paletteSuffix}${specSuffix}`.trim()
          : `${baseInstructions}${paletteSuffix}${specSuffix}`.trim();
        setCustomInstructions(combined);
        pendingInstructionsRef.current = combined;
        pendingInstructionsOnceRef.current = false;
        return combined; // Return for immediate use
      } catch (error) {
        console.warn("[Builder] Dynamic instructions failed:", error);
        return null;
      } finally {
        setIsPreparingPrompt(false);
      }
    },
    [
      chatId,
      customInstructions,
      generateDynamicInstructions,
      paletteState,
      promptAssistDeep,
      specMode,
      themeColors,
    ],
  );

  const requestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      setEntryIntentActive(false);
      const dynamicInstructions = await applyDynamicInstructionsForNewChat(message);
      captureInstructionSnapshot();
      const systemOverride = dynamicInstructions?.trim() ? dynamicInstructions.trim() : undefined;
      // Pass dynamic instructions directly to avoid state race condition
      await createNewChat(message, options, systemOverride);
      return true;
    },
    [
      createNewChat,
      captureInstructionSnapshot,
      applyDynamicInstructionsForNewChat,
    ],
  );

  // Auto-start generation for kostnadsfri flow after the user creates an account.
  // The wizard data is preserved via promptId → resolvedPrompt, so we just need
  // to trigger requestCreateChat once auth completes.
  const autoGenerateTriggeredRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (buildMethod !== "kostnadsfri") return;
    if (!resolvedPrompt) return;
    if (chatId) return; // already generating or has a chat
    if (autoGenerateTriggeredRef.current) return;
    autoGenerateTriggeredRef.current = true;

    // Use deterministic tier defaults for kostnadsfri auto-start.
    setSelectedModelTier("v0-max");
    setCustomModelId("");

    // Small delay to let the builder UI settle after auth modal closes
    const timer = setTimeout(() => {
      void requestCreateChat(resolvedPrompt);
    }, 500);
    return () => clearTimeout(timer);
  }, [isAuthenticated, buildMethod, resolvedPrompt, chatId, requestCreateChat]);

  const handleStartFromRegistry = useCallback(
    async (selection: ShadcnBlockSelection) => {
      if (!selection.registryUrl) {
        toast.error("Registry-URL saknas");
        return;
      }

      try {
        resetBeforeCreateChat();
        const quality = MODEL_TIER_TO_QUALITY[selectedModelTier] || "max";
        const name = selection.block?.title ? `shadcn/ui: ${selection.block.title}` : undefined;
        const response = await fetch("/api/v0/chats/init-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registryUrl: selection.registryUrl,
            quality,
            name,
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          chatId?: string;
          projectId?: string | null;
          project_id?: string | null;
          demoUrl?: string | null;
          error?: string;
          details?: string;
        } | null;

        if (!response.ok || !data?.chatId) {
          throw new Error(data?.error || data?.details || "Kunde inte starta från designsystem");
        }

        setChatId(data.chatId);
        if (appProjectId) {
          applyAppProjectId(appProjectId, { chatId: data.chatId });
        } else {
          const params = new URLSearchParams(searchParams.toString());
          params.set("chatId", data.chatId);
          router.replace(`/builder?${params.toString()}`);
        }
        setMessages([]);
        setCurrentDemoUrl(data.demoUrl || null);
        if (appProjectId) {
          saveProjectData(appProjectId, {
            chatId: data.chatId,
            demoUrl: data.demoUrl ?? undefined,
          }).catch((error) => {
            console.warn("[Builder] Failed to save registry project mapping:", error);
          });
        }
        toast.success("Designsystem-projekt skapat!");
      } catch (error) {
        throw (error instanceof Error
          ? error
          : new Error("Kunde inte starta från designsystem"));
      }
    },
    [
      resetBeforeCreateChat,
      selectedModelTier,
      router,
      setChatId,
      setMessages,
      setCurrentDemoUrl,
      appProjectId,
      applyAppProjectId,
      searchParams,
    ],
  );

  const handleStartFromTemplate = useCallback(
    (templateId: string) => {
      if (!templateId) return;
      if (isTemplateLoading || isPreparingPrompt) {
        toast.error("Vänta tills nuvarande mall/process är klar innan du väljer en ny mall.");
        return;
      }

      const hasActiveGeneration = isCreatingChat || isAnyStreaming;
      if (hasActiveGeneration) {
        const shouldAbort = window.confirm(
          "Generering pågår just nu. Vill du avbryta och starta från mallen istället?",
        );
        if (!shouldAbort) return;
        cancelActiveGeneration();
      }

      if (chatId) {
        const shouldStartFresh = window.confirm(
          "Du har redan en aktiv chat. Vill du starta en ny chat från vald mall?",
        );
        if (!shouldStartFresh) return;
      }

      setChatId(null);
      setMessages([]);
      setCurrentDemoUrl(null);
      setSelectedVersionId(null);
      setEntryIntentActive(false);
      templateInitAttemptKeyRef.current = null;
      const params = new URLSearchParams(searchParams.toString());
      params.delete("chatId");
      params.delete("prompt");
      params.delete("promptId");
      params.delete("source");
      params.set("templateId", templateId);
      router.replace(`/builder?${params.toString()}`);
    },
    [
      chatId,
      isAnyStreaming,
      isCreatingChat,
      isPreparingPrompt,
      isTemplateLoading,
      cancelActiveGeneration,
      router,
      searchParams,
    ],
  );

  const handleGoHome = useCallback(() => {
    const hasActiveGeneration = isCreatingChat || isAnyStreaming || isTemplateLoading || isPreparingPrompt;
    if (hasActiveGeneration) {
      const shouldAbort = window.confirm(
        "Generering pågår just nu. Vill du avbryta och gå till startsidan?",
      );
      if (!shouldAbort) return;
      cancelActiveGeneration();
    }
    router.push("/");
  }, [
    isAnyStreaming,
    isCreatingChat,
    isPreparingPrompt,
    isTemplateLoading,
    cancelActiveGeneration,
    router,
  ]);

  const handlePaletteSelection = useCallback((selection: PaletteSelection) => {
    setPaletteState((prev) => mergePaletteSelection(prev, selection));
  }, []);

  usePersistedChatMessages({
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
  });

  const handleSaveProject = useCallback(async () => {
    if (isSavingProject) return;
    if (!isAuthenticated) {
      setAuthModalReason("save");
      return;
    }
    if (!chatId) {
      toast.error("Ingen chat att spara ännu.");
      return;
    }

    setIsSavingProject(true);
    try {
      let targetProjectId = appProjectId;
      if (!targetProjectId) {
        const dateLabel = new Date().toLocaleDateString("sv-SE");
        const firstUserMessage = messages.find(
          (message) => message.role === "user" && typeof message.content === "string",
        );
        const preferredName = pendingProjectName?.trim();
        const baseTitle = preferredName || firstUserMessage?.content?.trim().slice(0, 40);
        const name = preferredName
          ? preferredName
          : baseTitle
            ? `${baseTitle} - ${dateLabel}`
            : `Projekt ${dateLabel}`;
        const description = firstUserMessage?.content?.trim().slice(0, 100);

        const created = await createProject(name, undefined, description);
        targetProjectId = created.id;
        setAppProjectId(created.id);
        setAppProjectName(created.name);

        const params = new URLSearchParams(searchParams);
        params.set("project", created.id);
        params.set("chatId", chatId);
        router.replace(`/builder?${params.toString()}`);
      }

      let files: Array<{ name: string; content: string }> = [];
      if (activeVersionId) {
        const materializeParam = mediaEnabled ? "&materialize=1" : "";
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            activeVersionId,
          )}${materializeParam}`,
        );
        const data = (await response.json().catch(() => null)) as {
          files?: Array<{ name: string; content: string }>;
        } | null;
        if (response.ok && Array.isArray(data?.files)) {
          files = data.files;
        }
      }

      await saveProjectData(targetProjectId, {
        chatId,
        demoUrl: currentDemoUrl ?? undefined,
        files,
        messages,
        meta: { palette: paletteState },
      });
      toast.success("Projekt sparat.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte spara projektet.");
    } finally {
      setIsSavingProject(false);
    }
  }, [
    isSavingProject,
    isAuthenticated,
    chatId,
    appProjectId,
    activeVersionId,
    currentDemoUrl,
    mediaEnabled,
    messages,
    paletteState,
    pendingProjectName,
    router,
    searchParams,
  ]);

  const resetToNewChat = useCallback(() => {
    setIsIntentionalReset(true);
    if (typeof window !== "undefined") {
      localStorage.removeItem("sajtmaskin:lastChatId");
    }
    if (chatId) {
      clearPersistedMessages(chatId);
    }
    router.replace("/builder");
    setChatId(null);
    setAppProjectId(null);
    setAppProjectName(null);
    setPendingProjectName(null);
    setDeployNameInput("");
    setDeployNameDialogOpen(false);
    setV0ProjectId(null);
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
    setMessages([]);
    setIsImportModalOpen(false);
    setIsSandboxModalOpen(false);
    setSelectedModelTier(DEFAULT_MODEL_TIER);
    setCustomModelId("");
    setEnableImageGenerations(DEFAULT_IMAGE_GENERATIONS);
    setCustomInstructions(DEFAULT_CUSTOM_INSTRUCTIONS);
    setApplyInstructionsOnce(false);
    pendingInstructionsRef.current = null;
    pendingInstructionsOnceRef.current = null;
    hasLoadedInstructions.current = false;
    hasLoadedInstructionsOnce.current = false;
  }, [router, chatId]);

  const handleClearPreview = useCallback(() => {
    setCurrentDemoUrl(null);
  }, []);

  const clearInspectorSelection = useCallback(() => {
    setInspectorSelection(null);
    setInspectorClearToken(Date.now());
  }, []);

  const handleFixPreview = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat att reparera ännu.");
      return;
    }
    const prompt = currentDemoUrl
      ? "Preview verkar vara fel eller laddar inte. Fixa versionen och returnera en fungerande demoUrl. Behåll layouten om möjligt. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt."
      : "Preview-länk saknas. Regenerera senaste versionen så att en demoUrl returneras. Om du använder Dialog, säkerställ att DialogTitle och DialogDescription finns (sr-only ok) eller att aria-describedby är korrekt.";
    await sendMessage(prompt);
  }, [chatId, currentDemoUrl, sendMessage]);

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      setSelectedVersionId(versionId);
      const match = effectiveVersionsList.find(
        (version) => version.versionId === versionId || version.id === versionId,
      );
      if (match?.demoUrl) {
        setCurrentDemoUrl(match.demoUrl);
        bumpPreviewRefreshToken();
      }
    },
    [effectiveVersionsList, bumpPreviewRefreshToken],
  );

  const handleToggleVersionPanel = useCallback(() => {
    setIsVersionPanelCollapsed((prev) => !prev);
  }, []);

  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;

  useEffect(() => {
    if (templateId) return;
    templateInitAttemptKeyRef.current = null;
  }, [templateId]);

  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!templateId || chatId) return;
    if (isCreatingChat || isAnyStreaming) return;
    const initKey = `${templateId}:${selectedModelTier}`;
    if (templateInitAttemptKeyRef.current === initKey) return;
    templateInitAttemptKeyRef.current = initKey;
    let isActive = true;

    const initTemplate = async () => {
      setIsTemplateLoading(true);
      try {
        const quality = MODEL_TIER_TO_QUALITY[selectedModelTier] || "max";
        const response = await fetch("/api/template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, quality }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Template init failed");
        }

        if (data?.chatId) {
          setChatId(data.chatId);
          if (appProjectId) {
            applyAppProjectId(appProjectId, { chatId: data.chatId });
          } else {
            const params = new URLSearchParams(searchParams.toString());
            params.set("chatId", data.chatId);
            router.replace(`/builder?${params.toString()}`);
          }
        }
        if (data?.demoUrl) {
          setCurrentDemoUrl(data.demoUrl);
        }
        if (data?.chatId && appProjectId) {
          saveProjectData(appProjectId, {
            chatId: data.chatId,
            demoUrl: data.demoUrl ?? undefined,
          }).catch((error) => {
            console.warn("[Builder] Failed to save template project mapping:", error);
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Template init failed";
        console.error("[Builder] Template init failed:", error);
        if (isActive) {
          toast.error(message);
          // Prevent repeated auto-init loops on failed template startup
          // (e.g. insufficient credits or temporary API errors).
          const params = new URLSearchParams(searchParams.toString());
          params.delete("templateId");
          const query = params.toString();
          router.replace(query ? `/builder?${query}` : "/builder");
        }
      } finally {
        if (isActive) {
          setIsTemplateLoading(false);
        }
      }
    };

    void initTemplate();
    return () => {
      isActive = false;
    };
  }, [
    auditPromptLoaded,
    templateId,
    chatId,
    isCreatingChat,
    isAnyStreaming,
    router,
    selectedModelTier,
    appProjectId,
    applyAppProjectId,
    searchParams,
  ]);

  return (
    <ErrorBoundary chatId={chatId} versionId={activeVersionId}>
      <main className="bg-muted/30 flex h-screen w-screen flex-col overflow-hidden">
        <Toaster position="top-right" />

        <BuilderHeader
          selectedModelTier={selectedModelTier}
          onSelectedModelTierChange={setSelectedModelTier}
          allowExperimentalModelId={allowExperimentalModelId}
          customModelId={customModelId}
          onCustomModelIdChange={setCustomModelId}
          promptAssistModel={promptAssistModel}
          onPromptAssistModelChange={handlePromptAssistModelChange}
          promptAssistDeep={promptAssistDeep}
          onPromptAssistDeepChange={setPromptAssistDeep}
          canUseDeepBrief={!chatId}
          customInstructions={customInstructions}
          onCustomInstructionsChange={setCustomInstructions}
          applyInstructionsOnce={applyInstructionsOnce}
          onApplyInstructionsOnceChange={setApplyInstructionsOnce}
          enableImageGenerations={enableImageGenerations}
          onEnableImageGenerationsChange={setEnableImageGenerations}
          enableThinking={enableThinking}
          onEnableThinkingChange={setEnableThinking}
          isThinkingSupported={isThinkingSupported}
          isImageGenerationsSupported={isImageGenerationsSupported}
          isMediaEnabled={isMediaEnabled}
          enableBlobMedia={enableBlobMedia}
          onEnableBlobMediaChange={setEnableBlobMedia}
          showStructuredChat={showStructuredChat}
          onShowStructuredChatChange={setShowStructuredChat}
          chatId={chatId}
          activeVersionId={activeVersionId}
          onOpenImport={() => {
            setIsSandboxModalOpen(false);
            setIsImportModalOpen(true);
          }}
          onOpenSandbox={() => {
            setIsImportModalOpen(false);
            setIsSandboxModalOpen(true);
          }}
          onDeployProduction={handleOpenDeployDialog}
          onDomainSearch={() => setDomainSearchOpen(true)}
          onGoHome={handleGoHome}
          onNewChat={resetToNewChat}
          onSaveProject={handleSaveProject}
          isDeploying={isDeploying}
          isCreatingChat={isCreatingChat || isTemplateLoading}
          isAnyStreaming={isAnyStreaming}
          isSavingProject={isSavingProject}
          canDeploy={Boolean(
            chatId && activeVersionId && !isCreatingChat && !isAnyStreaming && !isDeploying,
          )}
          canSaveProject={Boolean(chatId)}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="border-border bg-background flex w-full flex-col border-r lg:w-96">
            <IntegrationStatusPanel />
            <ProjectEnvVarsPanel projectId={v0ProjectId} />
            <div className="flex-1 overflow-hidden">
              <MessageList
                chatId={chatId}
                messages={messages}
                showStructuredParts={showStructuredChat}
                onQuickReply={(text) => sendMessage(text)}
                quickReplyDisabled={
                  isCreatingChat || isAnyStreaming || isTemplateLoading || isPreparingPrompt
                }
              />
              <ThinkingOverlay isVisible={isAnyStreaming} />
            </div>
            <ChatInterface
              chatId={chatId}
              initialPrompt={auditPromptLoaded ? initialPrompt : null}
              onCreateChat={requestCreateChat}
              onSendMessage={sendMessage}
              onStartFromRegistry={handleStartFromRegistry}
              onStartFromTemplate={handleStartFromTemplate}
              onPaletteSelection={handlePaletteSelection}
              paletteSelections={paletteState.selections}
              designTheme={designTheme}
              onDesignThemeChange={setDesignTheme}
              onEnhancePrompt={handlePromptEnhance}
              isBusy={isCreatingChat || isAnyStreaming || isTemplateLoading || isPreparingPrompt}
              isPreparingPrompt={isPreparingPrompt}
              mediaEnabled={mediaEnabled}
              currentCode={currentPageCode}
              existingUiComponents={existingUiComponents}
              inspectorSelection={inspectorSelection}
              onInspectorSelectionClear={clearInspectorSelection}
            />
            <DeployNameDialog
              open={deployNameDialogOpen}
              deployName={deployNameInput}
              deployNameError={deployNameError}
              isDeploying={isDeploying}
              isSaving={isDeployNameSaving}
              onDeployNameChange={(value) => {
                setDeployNameInput(value);
                if (deployNameError) setDeployNameError(null);
              }}
              onCancel={() => setDeployNameDialogOpen(false)}
              onConfirm={handleConfirmDeploy}
            />

            <DomainSearchDialog
              open={domainSearchOpen}
              query={domainQuery}
              results={domainResults}
              isSearching={isDomainSearching}
              onQueryChange={setDomainQuery}
              onSearch={handleDomainSearch}
              onClose={() => setDomainSearchOpen(false)}
            />
          </div>

          <div className="hidden flex-1 overflow-hidden lg:flex">
            <div className="flex flex-1 flex-col overflow-hidden">
              <PreviewPanel
                chatId={chatId}
                versionId={activeVersionId}
                demoUrl={currentDemoUrl}
                isLoading={isAnyStreaming || isCreatingChat}
                imageGenerationsEnabled={enableImageGenerations}
                imageGenerationsSupported={isImageGenerationsSupported}
                isBlobConfigured={isMediaEnabled}
                onClear={handleClearPreview}
                onFixPreview={handleFixPreview}
                refreshToken={previewRefreshToken}
                onInspectorSelection={setInspectorSelection}
                inspectorClearToken={inspectorClearToken}
              />
            </div>
            <div
              className={cn(
                "border-border bg-background flex h-full flex-col border-l transition-[width] duration-200",
                isVersionPanelCollapsed ? "w-10" : "w-80",
              )}
            >
              <VersionHistory
                chatId={chatId}
                selectedVersionId={activeVersionId}
                onVersionSelect={handleVersionSelect}
                isCollapsed={isVersionPanelCollapsed}
                onToggleCollapse={handleToggleVersionPanel}
                versions={versions}
                mutateVersions={mutateVersions}
              />
            </div>
          </div>
        </div>

        <SandboxModal
          isOpen={isSandboxModalOpen}
          onClose={() => setIsSandboxModalOpen(false)}
          chatId={chatId}
          versionId={activeVersionId}
          onUseInPreview={(url) => setCurrentDemoUrl(url)}
        />

        <InitFromRepoModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={(newChatId, _v0ProjectInternalId) => {
            setChatId(newChatId);
            if (appProjectId) {
              applyAppProjectId(appProjectId, { chatId: newChatId });
            } else {
              const params = new URLSearchParams(searchParams.toString());
              params.set("chatId", newChatId);
              router.replace(`/builder?${params.toString()}`);
            }
            setMessages([]);
            setCurrentDemoUrl(null);
          }}
        />

        <RequireAuthModal
          isOpen={Boolean(authModalReason)}
          onClose={() => {
            // Read fresh auth state directly from the store to avoid
            // stale closure — React hasn't re-rendered yet when AuthModal
            // calls onClose right after setUser().
            const freshlyAuthed = useAuthStore.getState().user !== null;
            if (authModalReason === "builder" && !freshlyAuthed) {
              router.push("/");
            }
            setAuthModalReason(null);
          }}
          reason={authModalReason ?? "builder"}
        />
      </main>
    </ErrorBoundary>
  );
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-muted/30 flex h-screen items-center justify-center">
          <div className="text-center">
            <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
            <p className="text-muted-foreground mt-4 text-sm">Loading builder...</p>
          </div>
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}
