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
import type { V0UserFileAttachment } from "@/components/media";
import { Button } from "@/components/ui/button";
import { clearPersistedMessages } from "@/lib/builder/messagesStorage";
import type { ChatMessage } from "@/lib/builder/types";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_MODEL_TIER,
  DEFAULT_PROMPT_ASSIST,
  getDefaultPromptAssistModel,
  MODEL_TIER_OPTIONS,
} from "@/lib/builder/defaults";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { usePromptAssist } from "@/lib/hooks/usePromptAssist";
import { useV0ChatMessaging } from "@/lib/hooks/useV0ChatMessaging";
import { useVersions } from "@/lib/hooks/useVersions";
import { useAuth } from "@/lib/auth/auth-store";
import type { PromptAssistProvider } from "@/lib/builder/promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";
import type { QualityLevel } from "@/lib/v0/v0-generator";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/utils/debug";
import { Check, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";

type CreateChatOptions = {
  attachments?: V0UserFileAttachment[];
  attachmentPrompt?: string;
  skipPromptAssist?: boolean;
};

const MODEL_TIER_TO_QUALITY: Record<ModelTier, QualityLevel> = {
  "v0-mini": "light",
  "v0-pro": "standard",
  "v0-max": "max",
};


function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fetchUser } = useAuth();

  const chatIdParam = searchParams.get("chatId");
  const promptParam = searchParams.get("prompt");
  const templateId = searchParams.get("templateId");
  const source = searchParams.get("source");
  const auditId = searchParams.get("auditId");
  const hasEntryParams = Boolean(promptParam || templateId || source === "audit");

  const [chatId, setChatId] = useState<string | null>(chatIdParam);
  const [currentDemoUrl, setCurrentDemoUrl] = useState<string | null>(null);
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isVersionPanelCollapsed, setIsVersionPanelCollapsed] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>(DEFAULT_MODEL_TIER);
  const [promptAssistProvider, setPromptAssistProvider] = useState<PromptAssistProvider>(
    DEFAULT_PROMPT_ASSIST.provider,
  );
  const [promptAssistModel, setPromptAssistModel] = useState(DEFAULT_PROMPT_ASSIST.model);
  const [promptAssistDeep, setPromptAssistDeep] = useState(DEFAULT_PROMPT_ASSIST.deep);
  const [isSandboxModalOpen, setIsSandboxModalOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [enableImageGenerations, setEnableImageGenerations] = useState(true);
  const [isImageGenerationsSupported, setIsImageGenerationsSupported] = useState(true);
  const [isMediaEnabled, setIsMediaEnabled] = useState(false);
  const [designSystemMode, setDesignSystemMode] = useState(false);
  const [showStructuredChat, setShowStructuredChat] = useState(false);
  const [deployImageStrategy, setDeployImageStrategy] = useState<"external" | "blob">("external");
  const [isIntentionalReset, setIsIntentionalReset] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(DEFAULT_CUSTOM_INSTRUCTIONS);
  const hasUserSelectedImageStrategy = useRef(false);
  const hasUserSelectedImageGenerations = useRef(false);
  const hasLoadedInstructions = useRef(false);
  const pendingInstructionsRef = useRef<string | null>(null);

  const [auditPromptLoaded, setAuditPromptLoaded] = useState(source !== "audit");
  const [resolvedPrompt, setResolvedPrompt] = useState<string | null>(promptParam);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{
    message: string;
    options?: CreateChatOptions;
  } | null>(null);
  const [hasSelectedModelTier, setHasSelectedModelTier] = useState(false);

  useEffect(() => {
    if (source !== "audit" || typeof window === "undefined") return;

    const storageKey = auditId ? `sajtmaskin_audit_prompt:${auditId}` : "sajtmaskin_audit_prompt";
    const storedPrompt = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);

    if (storedPrompt) {
      setResolvedPrompt(storedPrompt);
    }

    setAuditPromptLoaded(true);
  }, [source, auditId]);

  useEffect(() => {
    fetchUser().catch(() => {});
    // fetchUser is stable via zustand
  }, [fetchUser]);

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

  const fetchHealthFeatures = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      features?: { vercelBlob?: boolean; v0?: boolean };
    } | null;
    return {
      blobEnabled: Boolean(data?.features?.vercelBlob),
      v0Enabled: Boolean(data?.features?.v0),
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    const loadImageStrategyDefault = async () => {
      try {
        const flags = await fetchHealthFeatures(controller.signal);
        if (!flags) return;
        const { blobEnabled, v0Enabled } = flags;
        if (!isActive) return;
        setIsMediaEnabled(blobEnabled);
        setIsImageGenerationsSupported(v0Enabled);
        if (!v0Enabled) {
          setEnableImageGenerations(false);
        } else if (!hasUserSelectedImageGenerations.current) {
          setEnableImageGenerations(true);
        }
        if (!blobEnabled) {
          setDeployImageStrategy("external");
        }
        debugLog("AI", "Builder feature flags resolved", {
          v0Enabled,
          blobEnabled,
          userSelectedImageGenerations: hasUserSelectedImageGenerations.current,
          userSelectedImageStrategy: hasUserSelectedImageStrategy.current,
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
    if (typeof window === "undefined") return;
    if (source !== "audit") return;
    if (!auditId || !currentDemoUrl) return;

    const key = `sajtmaskin_audit_prompt:${auditId}`;
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    sessionStorage.removeItem("sajtmaskin_audit_prompt_id");
  }, [source, auditId, currentDemoUrl]);

  const { chat } = useChat(chatId);
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
  const versionIdSet = useMemo(() => {
    return new Set(
      versionsList
        .map((version) => version.versionId || version.id || null)
        .filter((versionId): versionId is string => Boolean(versionId)),
    );
  }, [versionsList]);

  useEffect(() => {
    setSelectedVersionId(null);
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

    if (!chatIdParam && !chatId && !hasEntryParams) {
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
  }, [chatIdParam, chatId, router, isIntentionalReset, hasEntryParams]);

  useEffect(() => {
    if (!chatId) return;
    try {
      localStorage.setItem("sajtmaskin:lastChatId", chatId);
    } catch {
      // ignore storage errors
    }
  }, [chatId]);

  useEffect(() => {
    if (chat?.demoUrl && !currentDemoUrl) {
      setCurrentDemoUrl(chat.demoUrl);
    }
  }, [chat, currentDemoUrl]);

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
        let resolvedStrategy = deployImageStrategy;
        if (deployImageStrategy === "blob") {
          const flags = await fetchHealthFeatures();
          if (flags && !flags.blobEnabled) {
            setIsMediaEnabled(false);
            setDeployImageStrategy("external");
            resolvedStrategy = "external";
            toast.error("Vercel Blob är avstängt. Byter till External URLs.");
          }
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
    [chatId, activeVersionId, isDeploying, deployImageStrategy, fetchHealthFeatures],
  );

  const handleDeployImageStrategyChange = useCallback((strategy: "external" | "blob") => {
    hasUserSelectedImageStrategy.current = true;
    setDeployImageStrategy(strategy);
  }, []);

  const handleEnableImageGenerationsChange = useCallback((value: boolean) => {
    hasUserSelectedImageGenerations.current = true;
    setEnableImageGenerations(value);
  }, []);

  const { maybeEnhanceInitialPrompt } = usePromptAssist({
    provider: promptAssistProvider,
    model: promptAssistModel,
    deep: promptAssistDeep,
    imageGenerations: enableImageGenerations,
  });

  const handlePromptAssistProviderChange = useCallback(
    (provider: PromptAssistProvider) => {
      setPromptAssistProvider(provider);
      if (provider === "off") return;
      setPromptAssistModel(getDefaultPromptAssistModel(provider));
    },
    [],
  );

  const promptAssistStatus = useMemo(() => {
    if (promptAssistProvider === "off") return null;
    return `AI Gateway${promptAssistDeep ? " • Djup" : ""}`;
  }, [promptAssistProvider, promptAssistDeep]);

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
      if (data.chatId) {
        const normalized = pendingInstructionsRef.current?.trim() || "";
        if (normalized) {
          try {
            localStorage.setItem(`sajtmaskin:chatInstructions:${data.chatId}`, normalized);
          } catch {
            // ignore storage errors
          }
          setCustomInstructions(normalized);
        }
        pendingInstructionsRef.current = null;
      }
      if (data.chatId && data.versionId) {
        // Run CSS validation in background (don't block UI)
        validateCss(data.chatId, data.versionId).catch((err) => {
          console.warn("[CSS Validation] Failed:", err);
        });
      }
    },
    [validateCss],
  );

  const { isCreatingChat, createNewChat, sendMessage } = useV0ChatMessaging({
    chatId,
    setChatId,
    chatIdParam,
    router,
    selectedModelTier,
    enableImageGenerations,
    systemPrompt: customInstructions,
    maybeEnhanceInitialPrompt,
    mutateVersions,
    setCurrentDemoUrl,
    onPreviewRefresh: bumpPreviewRefreshToken,
    onGenerationComplete: handleGenerationComplete,
    setMessages,
    resetBeforeCreateChat,
  });

  const confirmModelSelection = useCallback(async () => {
    const pending = pendingCreate;
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(true);
    if (!pending) return;
    await createNewChat(pending.message, pending.options);
  }, [pendingCreate, createNewChat]);

  const requestCreateChat = useCallback(
    async (message: string, options?: CreateChatOptions) => {
      pendingInstructionsRef.current = customInstructions.trim() || null;
      if (!chatId && !hasSelectedModelTier) {
        setPendingCreate({ message, options });
        setIsModelSelectOpen(true);
        return false;
      }
      await createNewChat(message, options);
      return true;
    },
    [chatId, hasSelectedModelTier, createNewChat, customInstructions],
  );

  const handleStartFromRegistry = useCallback(
    async (selection: ShadcnBlockSelection) => {
      if (!selection.registryUrl) {
        toast.error("Registry-URL saknas");
        return;
      }

      try {
        resetBeforeCreateChat();
        const quality = MODEL_TIER_TO_QUALITY[selectedModelTier] || "standard";
        const name = selection.block?.title
          ? `Design System: ${selection.block.title}`
          : undefined;
        const response = await fetch("/api/v0/chats/init-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registryUrl: selection.registryUrl,
            quality,
            name,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | {
              chatId?: string;
              demoUrl?: string | null;
              error?: string;
              details?: string;
            }
          | null;

        if (!response.ok || !data?.chatId) {
          throw new Error(data?.error || data?.details || "Kunde inte starta från Design System");
        }

        setChatId(data.chatId);
        router.replace(`/builder?chatId=${encodeURIComponent(data.chatId)}`);
        setMessages([]);
        setCurrentDemoUrl(data.demoUrl || null);
        setHasSelectedModelTier(true);
        toast.success("Design System-projekt skapat!");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Kunde inte starta från Design System");
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
    ],
  );

  usePersistedChatMessages({
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
  });

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
    setCurrentDemoUrl(null);
    setPreviewRefreshToken(0);
    setMessages([]);
    setIsImportModalOpen(false);
    setIsSandboxModalOpen(false);
    setIsModelSelectOpen(false);
    setPendingCreate(null);
    setHasSelectedModelTier(false);
    setCustomInstructions(DEFAULT_CUSTOM_INSTRUCTIONS);
    pendingInstructionsRef.current = null;
    hasLoadedInstructions.current = false;
  }, [router, chatId]);

  const handleClearPreview = useCallback(() => {
    setCurrentDemoUrl(null);
  }, []);

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
        const response = await fetch("/api/template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, quality: "standard" }),
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Template init failed");
        }

        if (data?.chatId) {
          setChatId(data.chatId);
          router.replace(`/builder?chatId=${encodeURIComponent(data.chatId)}`);
        }
        if (data?.demoUrl) {
          setCurrentDemoUrl(data.demoUrl);
        }
      } catch (error) {
        console.error("[Builder] Template init failed:", error);
      } finally {
        setIsTemplateLoading(false);
      }
    };

    void initTemplate();
  }, [auditPromptLoaded, templateId, chatId, isTemplateLoading, router]);

  return (
    <ErrorBoundary>
      <div className="bg-muted/30 flex h-screen w-screen flex-col overflow-hidden">
        <Toaster position="top-right" />

        <BuilderHeader
          selectedModelTier={selectedModelTier}
          onSelectedModelTierChange={setSelectedModelTier}
          promptAssistProvider={promptAssistProvider}
          onPromptAssistProviderChange={handlePromptAssistProviderChange}
          promptAssistModel={promptAssistModel}
          onPromptAssistModelChange={setPromptAssistModel}
          promptAssistDeep={promptAssistDeep}
          onPromptAssistDeepChange={setPromptAssistDeep}
          customInstructions={customInstructions}
          onCustomInstructionsChange={setCustomInstructions}
          enableImageGenerations={enableImageGenerations}
          onEnableImageGenerationsChange={handleEnableImageGenerationsChange}
          imageGenerationsSupported={isImageGenerationsSupported}
          blobSupported={isMediaEnabled}
          designSystemMode={designSystemMode}
          onDesignSystemModeChange={setDesignSystemMode}
          showStructuredChat={showStructuredChat}
          onShowStructuredChatChange={setShowStructuredChat}
          deployImageStrategy={deployImageStrategy}
          onDeployImageStrategyChange={handleDeployImageStrategyChange}
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
          isDeploying={isDeploying}
          isCreatingChat={isCreatingChat || isTemplateLoading}
          isAnyStreaming={isAnyStreaming}
          canDeploy={Boolean(
            chatId && activeVersionId && !isCreatingChat && !isAnyStreaming && !isDeploying,
          )}
        />

        <div className="flex flex-1 overflow-hidden">
          <div className="border-border bg-background flex w-full flex-col border-r lg:w-96">
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
              onEnhancePrompt={maybeEnhanceInitialPrompt}
              promptAssistStatus={promptAssistStatus}
              isBusy={isCreatingChat || isAnyStreaming || isTemplateLoading}
              designSystemMode={designSystemMode}
              mediaEnabled={isMediaEnabled}
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
          onSuccess={(newChatId) => {
            setChatId(newChatId);
            router.replace(`/builder?chatId=${newChatId}`);
            setMessages([]);
            setCurrentDemoUrl(null);
            setHasSelectedModelTier(true);
          }}
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
                  Du kan ändra senare i toppmenyn. Detta påverkar bara första körningen.
                </p>
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
