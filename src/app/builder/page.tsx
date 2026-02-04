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
import type { V0UserFileAttachment } from "@/components/media";
import { Button } from "@/components/ui/button";
import { clearPersistedMessages } from "@/lib/builder/messagesStorage";
import type { ChatMessage } from "@/lib/builder/types";
import { buildPromptAssistContext } from "@/lib/builder/promptAssistContext";
import { createProject, saveProjectData } from "@/lib/project-client";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  getDefaultPromptAssistModel,
  getPromptAssistModelOptions,
  MODEL_TIER_OPTIONS,
} from "@/lib/builder/defaults";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptAssist } from "@/lib/hooks/usePromptAssist";
import { useV0ChatMessaging } from "@/lib/hooks/useV0ChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useAuth } from "@/lib/auth/auth-store";
import { RequireAuthModal } from "@/components/auth";
import { formatPromptForV0, isGatewayAssistModel } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { QualityLevel } from "@/lib/v0/v0-generator";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/utils/debug";
import type { ImageAssetStrategy } from "@/lib/imageAssets";
import { Check, HelpCircle, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const { fetchUser, isAuthenticated } = useAuth();

  const chatIdParam = searchParams.get("chatId");
  const promptParam = searchParams.get("prompt");
  const promptId = searchParams.get("promptId");
  const projectParam = searchParams.get("project");
  const templateId = searchParams.get("templateId");
  const source = searchParams.get("source");
  const hasEntryParams = Boolean(promptParam || promptId || templateId || source === "audit");

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [currentDemoUrl, setCurrentDemoUrl] = useState<string | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isVersionPanelCollapsed, setIsVersionPanelCollapsed] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>(DEFAULT_MODEL_TIER);
  const [promptAssistModel, setPromptAssistModel] = useState(
    DEFAULT_PROMPT_ASSIST.model || getDefaultPromptAssistModel(),
  );
  const [promptAssistDeep, setPromptAssistDeep] = useState(DEFAULT_PROMPT_ASSIST.deep);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const enableImageGenerations = true;
  const [isImageGenerationsSupported, setIsImageGenerationsSupported] = useState(true);
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);
  const [designSystemMode, setDesignSystemMode] = useState(false);
  const [showStructuredChat, setShowStructuredChat] = useState(false);
  const [showSaveAuthModal, setShowSaveAuthModal] = useState(false);
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_CUSTOM_INSTRUCTIONS);
  const [applyInstructionsOnce, setApplyInstructionsOnce] = useState(false);
  const featureWarnedRef = useRef({ v0: false, blob: false });
  const hasLoadedInstructions = useRef(false);
  const pendingInstructionsRef = useRef<string | null>(null);
  const hasLoadedInstructionsOnce = useRef(false);
  const pendingInstructionsOnceRef = useRef<boolean | null>(null);
  const lastSyncedInstructionsRef = useRef<{ v0ProjectId: string; instructions: string } | null>(
    null,
  );

  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== "audit");
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [entryIntentActive, setEntryIntentActive] = useState(
    Boolean(promptParam || promptId || source === "audit"),
  );
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{
    message: string;
    options?: CreateChatOptions;
  } | null>(null);
  const [hasSelectedModelTier, setHasSelectedModelTier] = useState(false);
  const [appProjectId, setAppProjectId] = useState<string | null>(projectParam);
  const [v0ProjectId, setV0ProjectId] = useState<string | null>(null);
  const [promptAssistContext, setPromptAssistContext] = useState<string | null>(null);
  const promptAssistContextKeyRef = useRef<string | null>(null);
  // Raw page code for section analysis in component picker
  const [currentPageCode, setCurrentPageCode] = useState<string | undefined>(undefined);

  const selectedTierOption = useMemo(
    () => MODEL_TIER_OPTIONS.find((option) => option.value === selectedModelTier),
    [selectedModelTier],
  );
  const assistModelLabel = useMemo(() => {
    const options = getPromptAssistModelOptions();
    const match = options.find((o) => o.value === promptAssistModel);
    return match?.label || promptAssistModel || "Okänd";
  }, [promptAssistModel]);
  const promptPreview = useMemo(() => {
    const value = pendingCreate?.message?.trim() || "";
    if (!value) return "Ingen prompt hittades.";
    if (value.length <= 360) return value;
    return `${value.slice(0, 360)}…`;
  }, [pendingCreate]);
  const hasCustomInstructions = useMemo(() => {
    const trimmed = customInstructions.trim();
    if (!trimmed) return false;
    return trimmed !== DEFAULT_CUSTOM_INSTRUCTIONS.trim();
  }, [customInstructions]);
  const instructionsPreview = useMemo(() => {
    const trimmed = customInstructions.trim();
    if (!trimmed) return "Inga instruktioner.";
    if (trimmed.length <= 220) return trimmed;
    return `${trimmed.slice(0, 220)}…`;
  }, [customInstructions]);

  useEffect(() => {
    if (!promptId) return;
    let isActive = true;
    const controller = new AbortController();

    const fetchPrompt = async () => {
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
        setEntryIntentActive(true);
        setResolvedPrompt(data.prompt);
        const incomingProjectId = data.projectId ?? null;
        if (incomingProjectId) {
          setAppProjectId((prev) => prev ?? incomingProjectId);
        }
      } catch (error) {
        if (!isActive) return;
        console.warn("[Builder] Prompt handoff missing:", error);
        toast.error("Prompten hittades inte eller har redan använts.");
        setResolvedPrompt(null);
        setEntryIntentActive(false);
      } finally {
        if (isActive) {
          setAuditPromptLoaded(true);
          const nextParams = new URLSearchParams(searchParams.toString());
          nextParams.delete("promptId");
          const query = nextParams.toString();
          router.replace(query ? `/builder?${query}` : "/builder");
        }
      }
    };

    void fetchPrompt();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [promptId, router, searchParams]);

  useEffect(() => {
    fetchUser().catch(() => {});
    // fetchUser is stable via zustand
  }, [fetchUser]);

  useEffect(() => {
    if (projectParam) {
      setAppProjectId(projectParam);
    }
  }, [projectParam]);

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
      const params = new URLSearchParams();
      params.set("chatId", resolvedChatId);
      params.set("project", nextProjectId);
      router.replace(`/builder?${params.toString()}`);
    },
    [chatId, chatIdParam, projectParam, router],
  );

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
        if (!v0Enabled && !featureWarnedRef.current.v0) {
          featureWarnedRef.current.v0 = true;
          const reason = reasons?.v0 || "V0_API_KEY saknas";
          toast.error(`v0 är avstängt: ${reason}`);
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

  const { chat, mutate: mutateChat } = useChat(chatId);
  const chatV0ProjectId = (chat as { v0ProjectId?: string | null } | null)?.v0ProjectId ?? null;
  const { versions, mutate: mutateVersions } = useVersions(chatId);
  type VersionSummary = {
    id?: string | null;
    versionId?: string | null;
    demoUrl?: string | null;
  };
  const versionsList = useMemo(
    () => (Array.isArray(versions) ? (versions as VersionSummary[]) : []),
    [versions],
  );

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
      versionsList
        .map((version) => version.versionId || version.id || null)
        .filter((versionId): versionId is string => Boolean(versionId)),
    );
  }, [versionsList]);

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

    if (!chatIdParam && !chatId && !hasEntryParams && !entryIntentActive) {
      try {
        const last = localStorage.getItem("sajtmaskin:lastChatId");
        if (last) {
          setChatId(last);
          router.replace(`/builder?chatId=${encodeURIComponent(last)}`);
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams, entryIntentActive]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", chatId);
    } catch {
      // ignore storage errors
    }
  }, [chatId]);

  // Sync demoUrl from chat or versions when available (fallback if stream didn't provide it)
  useEffect(() => {
    if (currentDemoUrl) return; // Already have a demoUrl

    // Try chat.demoUrl first (comes from latest version in API)
    const chatDemoUrl = chat?.demoUrl;
    if (chatDemoUrl) {
      setCurrentDemoUrl(chatDemoUrl);
      return;
    }

    // Try chat.latestVersion.demoUrl
    const latestVersionDemoUrl = (chat as { latestVersion?: { demoUrl?: string | null } } | null)
      ?.latestVersion?.demoUrl;
    if (latestVersionDemoUrl) {
      setCurrentDemoUrl(latestVersionDemoUrl);
      return;
    }

    // Try first version in versionsList
    const firstVersionDemoUrl = versionsList[0]?.demoUrl;
    if (firstVersionDemoUrl) {
      setCurrentDemoUrl(firstVersionDemoUrl);
    }
  }, [chat, currentDemoUrl, versionsList]);

  const latestVersionId = useMemo(() => {
    const latestFromVersions = versionsList[0]?.versionId || versionsList[0]?.id || null;
    const latestFromChat = (() => {
      if (!chat || typeof chat !== "object") return null;
      const latest = (chat as { latestVersion?: { versionId?: string | null; id?: string | null } })
        .latestVersion;
      return latest?.versionId || latest?.id || null;
    })();
    return latestFromVersions || latestFromChat;
  }, [versionsList, chat]);

  const activeVersionId = selectedVersionId || latestVersionId;

  useEffect(() => {
    const contextKey = chatId && activeVersionId ? `${chatId}:${activeVersionId}` : null;
    if (!contextKey) {
      promptAssistContextKeyRef.current = null;
      setPromptAssistContext(null);
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
      } catch (error) {
        if (!isActive) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setPromptAssistContext("");
      }
    };

    fetchContext();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [chatId, activeVersionId]);

  const isAnyStreaming = useMemo(() => messages.some((m) => Boolean(m.isStreaming)), [messages]);

  const deployActiveVersionToVercel = useCallback(
    async (target: "production" | "preview" = "production") => {
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
        const resolvedStrategy: ImageAssetStrategy = isMediaEnabled ? "blob" : "external";
        if (!isMediaEnabled) {
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
    [chatId, activeVersionId, isDeploying, isMediaEnabled],
  );

  const { maybeEnhanceInitialPrompt } = usePromptAssist({
    model: promptAssistModel,
    deep: promptAssistDeep,
    imageGenerations: enableImageGenerations,
    codeContext: promptAssistContext,
  });

  const handlePromptAssistModelChange = useCallback((model: string) => {
    setPromptAssistModel(model);
    if (!isGatewayAssistModel(model)) {
      setPromptAssistDeep(false);
    }
  }, []);

  const handlePromptEnhance = useCallback(
    async (message: string) => {
      const isFollowUp = Boolean(chatId);
      const enhanced = await maybeEnhanceInitialPrompt(message, { forceShallow: isFollowUp });
      return formatPromptForV0(enhanced);
    },
    [chatId, maybeEnhanceInitialPrompt],
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
      if (data.chatId && data.versionId) {
        // Run CSS validation in background (don't block UI)
        validateCss(data.chatId, data.versionId).catch((err) => {
          console.warn("[CSS Validation] Failed:", err);
        });
        // Refetch chat data to get demoUrl if stream didn't provide it
        if (!data.demoUrl) {
          setTimeout(() => {
            mutateChat();
            mutateVersions();
          }, 1000); // Small delay to let DB update
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
    [applyInstructionsOnce, validateCss, appProjectId, mutateChat, mutateVersions],
  );

  const { isCreatingChat, createNewChat, sendMessage } = useV0ChatMessaging({
    chatId,
    setChatId,
    chatIdParam,
    router,
    appProjectId,
    v0ProjectId,
    selectedModelTier,
    enableImageGenerations,
    systemPrompt: customInstructions,
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

  const confirmModelSelection = useCallback(async () => {
    const pending = pendingCreate;
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(true);
    if (!pending) return;
    captureInstructionSnapshot();
    await createNewChat(pending.message, pending.options);
  }, [pendingCreate, createNewChat, captureInstructionSnapshot]);

  const requestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      if (!chatId && !hasSelectedModelTier) {
        setPendingCreate({ message, options });
        setIsModelSelectOpen(true);
        return false;
      }
      setEntryIntentActive(false);
      captureInstructionSnapshot();
      await createNewChat(message, options);
      return true;
    },
    [chatId, hasSelectedModelTier, createNewChat, captureInstructionSnapshot],
  );

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
          throw new Error(data?.error || data?.details || "Kunde inte starta från shadcn/ui");
        }

        setChatId(data.chatId);
        if (appProjectId) {
          applyAppProjectId(appProjectId, { chatId: data.chatId });
        } else {
          router.replace(`/builder?chatId=${encodeURIComponent(data.chatId)}`);
        }
        setMessages([]);
        setCurrentDemoUrl(data.demoUrl || null);
        setHasSelectedModelTier(true);
        if (appProjectId) {
          saveProjectData(appProjectId, {
            chatId: data.chatId,
            demoUrl: data.demoUrl ?? undefined,
          }).catch((error) => {
            console.warn("[Builder] Failed to save registry project mapping:", error);
          });
        }
        toast.success("shadcn/ui-projekt skapat!");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Kunde inte starta från shadcn/ui");
      }
    },
    [
      resetBeforeCreateChat,
      selectedModelTier,
      router,
      setChatId,
      setMessages,
      setCurrentDemoUrl,
      setHasSelectedModelTier,
      appProjectId,
      applyAppProjectId,
    ],
  );

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
      setShowSaveAuthModal(true);
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
        const baseTitle = firstUserMessage?.content?.trim().slice(0, 40);
        const name = baseTitle ? `${baseTitle} - ${dateLabel}` : `Projekt ${dateLabel}`;
        const description = firstUserMessage?.content?.trim().slice(0, 100);

        const created = await createProject(name, undefined, description);
        targetProjectId = created.id;
        setAppProjectId(created.id);

        const params = new URLSearchParams(searchParams);
        params.set("project", created.id);
        params.set("chatId", chatId);
        router.replace(`/builder?${params.toString()}`);
      }

      let files: Array<{ name: string; content: string }> = [];
      if (activeVersionId) {
        const response = await fetch(
          `/api/v0/chats/${encodeURIComponent(chatId)}/files?versionId=${encodeURIComponent(
            activeVersionId,
          )}&materialize=1`,
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
    messages,
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
    setV0ProjectId(null);
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
    setMessages([]);
    setIsImportModalOpen(false);
    setIsSandboxModalOpen(false);
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(false);
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

  const handleFixPreview = useCallback(async () => {
    if (!chatId) {
      toast.error("Ingen chat att reparera ännu.");
      return;
    }
    const prompt = currentDemoUrl
      ? "Preview verkar vara fel eller laddar inte. Fixa versionen och returnera en fungerande demoUrl. Behåll layouten om möjligt."
      : "Preview-länk saknas. Regenerera senaste versionen så att en demoUrl returneras.";
    await sendMessage(prompt);
  }, [chatId, currentDemoUrl, sendMessage]);

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      setSelectedVersionId(versionId);
      const match = versionsList.find(
        (version) => version.versionId === versionId || version.id === versionId,
      );
      if (match?.demoUrl) {
        setCurrentDemoUrl(match.demoUrl);
      }
    },
    [versionsList],
  );

  const handleToggleVersionPanel = useCallback(() => {
    setIsVersionPanelCollapsed((prev) => !prev);
  }, []);

  const initialPrompt = templateId ? null : resolvedPrompt?.trim() || null;

  useEffect(() => {
    if (!auditPromptLoaded) return;
    if (!templateId || chatId || isTemplateLoading) return;

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
            router.replace(`/builder?chatId=${encodeURIComponent(data.chatId)}`);
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
        console.error("[Builder] Template init failed:", error);
      } finally {
        setIsTemplateLoading(false);
      }
    };

    void initTemplate();
  }, [
    auditPromptLoaded,
    templateId,
    chatId,
    isTemplateLoading,
    router,
    selectedModelTier,
    appProjectId,
    applyAppProjectId,
  ]);

  return (
    <ErrorBoundary>
      <div className="bg-muted/30 flex h-screen w-screen flex-col overflow-hidden">
        <Toaster position="top-right" />

        <BuilderHeader
          selectedModelTier={selectedModelTier}
          onSelectedModelTierChange={setSelectedModelTier}
          promptAssistModel={promptAssistModel}
          onPromptAssistModelChange={handlePromptAssistModelChange}
          promptAssistDeep={promptAssistDeep}
          onPromptAssistDeepChange={setPromptAssistDeep}
          canUseDeepBrief={!chatId}
          customInstructions={customInstructions}
          onCustomInstructionsChange={setCustomInstructions}
          applyInstructionsOnce={applyInstructionsOnce}
          onApplyInstructionsOnceChange={setApplyInstructionsOnce}
          designSystemMode={designSystemMode}
          onDesignSystemModeChange={setDesignSystemMode}
          showStructuredChat={showStructuredChat}
          onShowStructuredChatChange={setShowStructuredChat}
          onOpenImport={() => {
            setIsSandboxModalOpen(false);
            setIsImportModalOpen(true);
          }}
          onOpenSandbox={() => {
            setIsImportModalOpen(false);
            setIsSandboxModalOpen(true);
          }}
          onDeployProduction={() => deployActiveVersionToVercel("production")}
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
            <div className="flex-1 overflow-hidden">
              <MessageList
                chatId={chatId}
                messages={messages}
                showStructuredParts={showStructuredChat}
              />
            </div>
            <ChatInterface
              chatId={chatId}
              initialPrompt={auditPromptLoaded ? initialPrompt : null}
              onCreateChat={requestCreateChat}
              onSendMessage={sendMessage}
              onStartFromRegistry={handleStartFromRegistry}
              onEnhancePrompt={handlePromptEnhance}
              isBusy={isCreatingChat || isAnyStreaming || isTemplateLoading}
              designSystemMode={designSystemMode}
              mediaEnabled={isMediaEnabled}
              currentCode={currentPageCode}
            />
          </div>

          <div className="hidden flex-1 overflow-hidden lg:flex">
            <div className="flex flex-1 flex-col overflow-hidden">
              <PreviewPanel
                chatId={chatId}
                versionId={activeVersionId}
                demoUrl={currentDemoUrl}
                isLoading={isAnyStreaming || isCreatingChat}
                onClear={handleClearPreview}
                onFixPreview={handleFixPreview}
                refreshToken={previewRefreshToken}
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
              router.replace(`/builder?chatId=${newChatId}`);
            }
            setMessages([]);
            setCurrentDemoUrl(null);
            setHasSelectedModelTier(true);
          }}
        />

        <RequireAuthModal
          isOpen={showSaveAuthModal}
          onClose={() => setShowSaveAuthModal(false)}
          reason="save"
        />

        {isModelSelectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsModelSelectOpen(false);
                setPendingCreate(null);
              }}
            />
            <div className="border-border bg-background relative z-10 w-full max-w-lg rounded-xl border p-6 shadow-2xl">
              <div className="mb-4">
                <h2 className="text-foreground text-lg font-semibold">
                  Välj modell för första prompten
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Detta är första prompten i en ny chat. Du kan ändra senare i toppmenyn.
                </p>
              </div>
              <div className="border-border bg-muted/40 text-muted-foreground mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="mt-0.5 cursor-help">
                        <HelpCircle className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-xs">
                        Den här bekräftelsen visas bara för första prompten i en ny chat. Din prompt
                        skickas som naturligt språk. Om Prompt Assist är på så skrivs prompten om
                        innan v0 kör, medan system‑instruktioner skickas separat.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="space-y-1">
                  <div className="text-foreground text-sm font-medium">
                    Bekräfta första körningen
                  </div>
                  <div>
                    Vi visar en snabb översikt för att säkerställa att rätt modell och assist‑val
                    används innan chatId skapas.
                  </div>
                </div>
              </div>
              <div className="mb-4 space-y-2 text-xs">
                <div className="border-border bg-background/60 flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-muted-foreground">Model tier</span>
                  <span className="text-foreground font-medium">
                    {selectedTierOption?.label || selectedModelTier}
                  </span>
                </div>
                <div className="border-border bg-background/60 flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-muted-foreground">Förbättra‑modell</span>
                  <span className="text-foreground font-medium">
                    {assistModelLabel}
                    {isGatewayAssistModel(promptAssistModel) && promptAssistDeep ? " • Deep" : ""}
                  </span>
                </div>
                <div className="border-border bg-background/60 flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-muted-foreground">AI‑bilder</span>
                  <span className="text-foreground font-medium">
                    På
                    {!isImageGenerationsSupported && (
                      <span className="text-muted-foreground ml-2 text-xs">(v0 saknas)</span>
                    )}
                  </span>
                </div>
                <div className="border-border bg-background/60 rounded-lg border px-3 py-2">
                  <div className="text-muted-foreground">System‑instruktioner</div>
                  <div className="text-foreground mt-1">
                    {hasCustomInstructions ? instructionsPreview : "Standard"}
                  </div>
                </div>
                <div className="border-border bg-background/60 rounded-lg border px-3 py-2">
                  <div className="text-muted-foreground">Första prompten</div>
                  <div className="text-foreground mt-1 whitespace-pre-wrap">{promptPreview}</div>
                </div>
              </div>
              <div className="space-y-2">
                {MODEL_TIER_OPTIONS.map((option) => {
                  const isSelected = selectedModelTier === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedModelTier(option.value)}
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "border-brand-blue/60 bg-brand-blue/10"
                          : "border-border hover:border-brand-blue/40",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground text-sm font-medium">
                            {option.label}
                          </span>
                          {option.hint ? (
                            <span className="bg-brand-amber/20 text-brand-amber rounded-full px-2 py-0.5 text-[10px]">
                              {option.hint}
                            </span>
                          ) : null}
                        </div>
                        {isSelected ? <Check className="text-brand-blue h-4 w-4" /> : null}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">{option.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsModelSelectOpen(false);
                    setPendingCreate(null);
                  }}
                >
                  Avbryt
                </Button>
                <Button onClick={confirmModelSelection}>Fortsätt</Button>
              </div>
            </div>
          </div>
        )}
      </div>
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
