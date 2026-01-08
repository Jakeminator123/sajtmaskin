"use client";

/**
 * ChatPanel Component 3.0
 * =======================
 *
 * Hanterar all AI-interaktion och kodgenerering.
 *
 * INGÅNGSVÄGAR:
 * 1. Template (v0 community) → /api/template → chatId + kod
 * 2. Kategori (landing page, etc.) → initialPrompt → ny generation
 * 3. Sparad projekt → loadFromProject → befintlig chatId + kod
 * 4. Fri prompt → initialPrompt → ny generation
 *
 * SMART ROUTING (v3.0):
 * - Om chatId/kod finns → handleRefinement (även första prompten)
 * - Om inget finns → handleGenerate
 * - Alla prompts går genom /api/orchestrate (universal gatekeeper)
 *
 * ORCHESTRATOR INTENT-TYPER:
 * - image_only: Genererar bild → Mediabibliotek (INGEN v0-anrop)
 * - chat_response: Svarar direkt (INGEN v0-anrop)
 * - clarify: Frågar användaren (INGEN v0-anrop)
 * - code_only/image_and_code/web_and_code: Anropar v0 för kodändringar
 *
 * FÖRBÄTTRINGAR I 3.0:
 * - Bevarar chatId från template/saved project vid första edit
 * - handleGenerate skickar befintlig state om den finns
 * - chatId validering efter template load
 * - Smart routing i handleSubmit baserad på befintlig state
 *
 * VIKTIGT: v0:s demoUrl används för iframe-preview.
 */

import { RequireAuthModal } from "@/components/auth";
import {
  ChatMessage,
  GenerationProgress,
  ServiceSuggestions,
  Suggestions,
  DEFAULT_SUGGESTIONS,
  CATEGORY_SUGGESTIONS,
  UnifiedAssetModal,
} from "./index";
import { HelpTooltip } from "@/components/layout";
import {
  AttachmentChips,
  filesToAttachments,
  filesToPromptText,
  MediaBank,
  useMediaBank,
  type UploadedFile,
  type MediaItem,
} from "@/components/media";
import { Button } from "@/components/ui/button";
import { generateFromTemplate } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-store";
import type { MediaLibraryItem } from "@/lib/utils/prompt-utils";
import { useBuilderStore, type MessageAttachment } from "@/lib/data/store";
import {
  extractTemplateId,
  extractUrlFromNpxCommand,
  isNpxShadcnCommand,
  isV0Url,
  parseV0Url,
} from "@/lib/v0/v0-url-parser";
import type { OrchestratorResult } from "@/lib/ai/orchestrator-agent";

// Extended type for API response (includes extra fields added by route handlers)
interface ApiOrchestratorResponse extends OrchestratorResult {
  balance?: number;
  requireAuth?: boolean;
  requireCredits?: boolean;
  requiredDiamonds?: number;
  currentDiamonds?: number;
}
import {
  ArrowUp,
  Blocks,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  MousePointer2,
  Sparkles,
  X,
} from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// STREAMING HELPER - SSE for real-time thinking/progress updates
// ============================================================================

/**
 * Fetch with Server-Sent Events streaming support
 * Parses SSE events and calls callbacks for thinking/progress updates
 */
async function fetchWithStreaming(
  url: string,
  body: Record<string, unknown>,
  onThinking: (thought: string) => void,
  onProgress: (step: string) => void
): Promise<ApiOrchestratorResponse> {
  // Create AbortController for timeout handling
  const controller = new AbortController();

  // 5 minute timeout for complex generations (v0 can take 2-3 minutes)
  const STREAM_TIMEOUT_MS = 5 * 60 * 1000;
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let result: ApiOrchestratorResponse | null = null;
    let lastActivityTime = Date.now();

    // Timeout for individual reads (30 seconds of inactivity)
    const READ_TIMEOUT_MS = 30 * 1000;

    while (true) {
      // Check for read inactivity timeout
      if (Date.now() - lastActivityTime > READ_TIMEOUT_MS && !result) {
        console.warn("[Streaming] Read timeout - no data for 30s");
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      lastActivityTime = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (currentEvent && data) {
            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case "thinking":
                  if (parsed.message) onThinking(parsed.message);
                  break;
                case "progress":
                  if (parsed.step) onProgress(parsed.step);
                  break;
                case "heartbeat":
                  // Heartbeat keeps connection alive during long v0 generations
                  // Just update activity time, no UI update needed
                  break;
                case "complete":
                  result = parsed;
                  break;
                case "error":
                  throw new Error(parsed.error || "Streaming error");
              }
            } catch (e) {
              const parseMessage =
                e instanceof Error ? e.message : "Unknown parse error";
              const dataPreview =
                typeof data === "string" ? data.slice(0, 200) : "";

              if (currentEvent === "error") {
                throw new Error(
                  `[Streaming] Error event parse failed: ${parseMessage} (${dataPreview})`
                );
              }

              throw new Error(
                `[Streaming] Failed to parse event "${currentEvent}": ${parseMessage} (${dataPreview})`
              );
            }
            currentEvent = "";
          }
        }
      }

      // If we got complete, exit the loop
      if (result) break;
    }

    if (!result) {
      throw new Error("No complete event received");
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// GENERATION STATE using sessionStorage for persistence across Fast Refresh
// This is crucial because React StrictMode and mobile tab switching can cause
// multiple ChatPanel instances to run simultaneously
// ============================================================================
const GENERATION_STATE_KEY = "sajtmaskin_generation_state";
const PREVIOUS_CLARIFY_STORAGE_KEY = "sajtmaskin_previous_clarify";

interface GenerationState {
  lastKey: string | null;
  inProgress: boolean;
  timestamp: number;
}

function getGenerationState(): GenerationState {
  if (typeof window === "undefined") {
    return { lastKey: null, inProgress: false, timestamp: 0 };
  }
  try {
    const stored = sessionStorage.getItem(GENERATION_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return { lastKey: null, inProgress: false, timestamp: 0 };
}

function setGenerationState(state: GenerationState): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GENERATION_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

// Reset state after a timeout (prevents stale state blocking new generations)
// v0 API can take 5-10 minutes for complex premium generations
const GENERATION_TIMEOUT_MS = 600000; // 10 minutes
const SAME_KEY_COOLDOWN_MS = 30000; // 30 seconds cooldown for same key (allows faster retry after failures)

function canStartGeneration(key: string): boolean {
  const state = getGenerationState();
  const now = Date.now();

  // If generation is in progress but took too long, allow new one
  if (state.inProgress && now - state.timestamp > GENERATION_TIMEOUT_MS) {
    console.log("[ChatPanel] Generation timed out, allowing new one");
    setGenerationState({ ...state, inProgress: false });
    return true;
  }

  // If "inProgress" but it's been more than 60 seconds, assume page was refreshed mid-generation
  // This handles the case where user closes tab or refreshes during v0 API call
  if (state.inProgress && now - state.timestamp > 60000) {
    console.log("[ChatPanel] Stale inProgress state detected (>60s), clearing");
    setGenerationState({ ...state, inProgress: false });
    // Continue to cooldown check below
  }

  // Don't allow if generation is in progress
  if (state.inProgress) {
    console.log("[ChatPanel] Generation already in progress, blocking");
    return false;
  }

  // Don't allow if same key was just generated (within cooldown period)
  if (state.lastKey === key && now - state.timestamp < SAME_KEY_COOLDOWN_MS) {
    console.log(
      `[ChatPanel] Same key generated ${Math.round(
        (now - state.timestamp) / 1000
      )}s ago, blocking`
    );
    return false;
  }

  return true;
}

function markGenerationStarted(key: string): void {
  const state: GenerationState = {
    lastKey: key,
    inProgress: true,
    timestamp: Date.now(),
  };
  setGenerationState(state);
  console.log("[ChatPanel] Generation started for key:", key.substring(0, 50));
}

function markGenerationEnded(): void {
  const state = getGenerationState();
  setGenerationState({ ...state, inProgress: false });
  console.log("[ChatPanel] Generation ended");
}
// ============================================================================

interface ChatPanelProps {
  categoryType?: string;
  initialPrompt?: string;
  templateId?: string;
  instanceId?: string; // Unique ID to differentiate between desktop/mobile instances
  isPrimaryInstance?: boolean; // Only primary instance triggers generation (prevents duplicates)
  isProjectDataLoading?: boolean; // True while loading project data from database
  hasExistingData?: boolean; // True if project has saved data (skip auto-generation)
}

export function ChatPanel({
  categoryType,
  initialPrompt,
  templateId,
  instanceId = "default",
  isPrimaryInstance = true, // Only primary instance triggers auto-generation
  isProjectDataLoading = false, // Wait for project data before generating
  hasExistingData = false, // Skip generation if project has saved data
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalReason, setAuthModalReason] = useState<
    "generation" | "refine" | "credits"
  >("generation");
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );
  const [currentPromptLength, setCurrentPromptLength] = useState(0);
  const [isRefinementMode, setIsRefinementMode] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [clarifyOptions, setClarifyOptions] = useState<string[]>([]);
  // Track clarify context so user replies carry original question + prompt
  const [previousClarify, setPreviousClarify] = useState<{
    originalPrompt: string;
    clarifyQuestion: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate unique user seed for DiceBear avatar (persisted in sessionStorage)
  // Uses useEffect to avoid hydration mismatch between server and client
  const [userSeed, setUserSeed] = useState("user");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("sajtmaskin-user-seed");
    if (stored) {
      setUserSeed(stored);
    } else {
      const newSeed = `user-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      sessionStorage.setItem("sajtmaskin-user-seed", newSeed);
      setUserSeed(newSeed);
    }
  }, []);

  const { updateDiamonds, fetchUser, isAuthenticated } = useAuth();

  // Unified asset modal state (replaces separate media/text/component modals)
  const [showAssetModal, setShowAssetModal] = useState(false);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Media bank for generated images/videos
  const mediaBank = useMediaBank();

  // Typing detection refs
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const {
    messages,
    isLoading,
    currentCode,
    demoUrl,
    chatId,
    quality,
    addMessage,
    setLoading,
    setCurrentCode,
    setChatId,
    setFiles,
    setDemoUrl,
    setScreenshotUrl,
    setVersionId,
    clearChat,
    projectId,
    // explicitSave removed - auto-save disabled, user saves manually via header button
    designModeInput,
    setDesignModeInput,
    designModeCodeContext,
    setDesignModeCodeContext,
    isDesignModeActive,
    toggleDesignMode,
  } = useBuilderStore();

  // Persist/restore clarify context across Fast Refresh / remounts.
  // Otherwise, user replies won't include the original prompt + clarify question,
  // and the orchestrator will ask again.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!projectId) return;
    if (previousClarify) return;

    const key = `${PREVIOUS_CLARIFY_STORAGE_KEY}:${projectId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        originalPrompt?: unknown;
        clarifyQuestion?: unknown;
      };
      if (
        typeof parsed.originalPrompt === "string" &&
        typeof parsed.clarifyQuestion === "string"
      ) {
        setPreviousClarify({
          originalPrompt: parsed.originalPrompt,
          clarifyQuestion: parsed.clarifyQuestion,
        });
      }
    } catch {
      // ignore invalid storage
    }
  }, [projectId, previousClarify]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!projectId) return;

    const key = `${PREVIOUS_CLARIFY_STORAGE_KEY}:${projectId}`;
    if (!previousClarify) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(previousClarify));
  }, [projectId, previousClarify]);

  // Handle user typing state
  const handleTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
    }
  }, []);

  const handleTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
    }
  }, []);

  // Debounced typing detection
  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);

      // Start typing animation
      if (value.length > 0) {
        handleTypingStart();

        // Reset the stop timer
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        // Stop typing after 1.5 seconds of no input
        typingTimeoutRef.current = setTimeout(() => {
          handleTypingStop();
        }, 1500);
      } else {
        // Input cleared
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        handleTypingStop();
      }
    },
    [handleTypingStart, handleTypingStop]
  );

  // Cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Design Mode: fill input when element is selected in preview
  // Also shows code context if Code Crawler found relevant snippets
  useEffect(() => {
    if (designModeInput) {
      setInput(designModeInput);
      setDesignModeInput(null); // Clear after consuming

      // If we have code context from Code Crawler, add it to the input as a helper note
      if (designModeCodeContext && designModeCodeContext.length > 0) {
        const contextNote = `\n\n[Hittad kod: ${designModeCodeContext
          .map((c) => c.name)
          .join(", ")}]`;
        setInput((prev) => prev + contextNote);
        setDesignModeCodeContext(null); // Clear after consuming
        console.log("[ChatPanel] Design Mode: Added code context to input");
      }

      // Focus the input field
      const inputField = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder*="Skriv"]'
      );
      inputField?.focus();
    }
  }, [
    designModeInput,
    setDesignModeInput,
    designModeCodeContext,
    setDesignModeCodeContext,
  ]);

  // Synchronous ref for submit protection (prevents race conditions from React batching)
  const isSubmittingRef = useRef(false);

  // Track if initial generation has been triggered for THIS component instance
  // This prevents re-generation when component remounts (e.g., mobile tab switching)
  const hasInitialGeneratedRef = useRef(false);
  const lastGeneratedKeyRef = useRef<string | null>(null);

  // Ref for handleRefinement to avoid stale closure in useCallback dependencies
  const handleRefinementRef = useRef<
    ((instruction: string) => Promise<void>) | null
  >(null);

  // Check if we're in test mode (force regeneration, skip cache)
  const isTestMode =
    typeof window !== "undefined" &&
    typeof window.location !== "undefined" &&
    new URLSearchParams(window.location.search).get("testMode") === "true";

  // Auto-generate on initial load or when params change
  // Uses BOTH module-level state AND ref-level state for robust protection
  useEffect(() => {
    // CRITICAL: Only primary instance triggers generation (prevents duplicates from desktop/mobile)
    if (!isPrimaryInstance) {
      return;
    }

    // WAIT for project data to load before deciding to generate
    // This prevents race condition where we start generating before saved data is loaded
    if (isProjectDataLoading) {
      return;
    }

    // SKIP generation if project already has saved data
    // The data will be loaded by builder/page.tsx via loadFromProject()
    if (hasExistingData) {
      hasInitialGeneratedRef.current = true;
      return;
    }

    const currentKey = `${categoryType || ""}-${initialPrompt || ""}-${
      templateId || ""
    }`;

    // Skip if no key (no params set)
    if (!currentKey || currentKey === "---") return;

    // Skip if already loading (React state)
    if (isLoading) {
      return;
    }

    // REF-LEVEL protection: Skip if we already generated for this key in THIS instance
    // This is crucial for mobile tab switching where component remounts
    if (
      hasInitialGeneratedRef.current &&
      lastGeneratedKeyRef.current === currentKey
    ) {
      return;
    }

    // Skip if we already have content (demoUrl means generation completed)
    // This prevents re-generation when switching tabs on mobile
    if (demoUrl && lastGeneratedKeyRef.current === currentKey) {
      hasInitialGeneratedRef.current = true;
      return;
    }

    // MODULE-LEVEL protection: Check if we can start generation
    if (!canStartGeneration(currentKey) && !isTestMode) {
      return;
    }

    // In test mode, always clear and regenerate
    if (isTestMode && (messages.length > 0 || demoUrl)) {
      clearChat();
      setGenerationState({ lastKey: null, inProgress: false, timestamp: 0 });
      hasInitialGeneratedRef.current = false;
      lastGeneratedKeyRef.current = null;
      return;
    }

    // If we have content but it's from a DIFFERENT request, clear it first
    const genState = getGenerationState();
    const isNewRequest =
      genState.lastKey !== currentKey && genState.lastKey !== null;
    if (isNewRequest && (messages.length > 0 || demoUrl)) {
      clearChat();
      setGenerationState({ lastKey: null, inProgress: false, timestamp: 0 });
      hasInitialGeneratedRef.current = false;
      lastGeneratedKeyRef.current = null;
      return; // Wait for state to clear, effect will re-run
    }

    // Mark generation as started (both MODULE-LEVEL and REF-LEVEL)
    markGenerationStarted(currentKey);
    hasInitialGeneratedRef.current = true;
    lastGeneratedKeyRef.current = currentKey;

    // Handle different generation modes
    const startGeneration = async () => {
      try {
        if (templateId) {
          await handleTemplateGeneration(templateId);
        } else {
          // Use the prompt (either from URL or generate default based on category)
          const initialMessage =
            initialPrompt ||
            (categoryType ? `Skapa en ${getCategoryName(categoryType)}` : null);

          if (initialMessage) {
            await handleGenerate(initialMessage, categoryType);
          }
        }
      } catch (error) {
        console.error("[ChatPanel] Generation error:", error);
        addMessage(
          "assistant",
          `Ett fel uppstod: ${
            error instanceof Error ? error.message : "Okänt fel"
          }`
        );
      } finally {
        markGenerationEnded();
      }
    };

    // Fire-and-forget async operation (errors handled internally)
    startGeneration().catch((error) => {
      console.error("[ChatPanel] Unhandled generation error:", error);
      markGenerationEnded();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categoryType,
    initialPrompt,
    templateId,
    isLoading,
    isProjectDataLoading, // Wait for project data before generating
    hasExistingData, // Skip if project has saved data
    // NOTE: demoUrl REMOVED from deps - it was causing re-runs when generation completed
    // We now check demoUrl inside the effect instead
  ]);

  const getCategoryName = (type: string): string => {
    const names: Record<string, string> = {
      "landing-page": "landing page",
      website: "hemsida",
      "apps-games": "app eller spel",
      dashboard: "dashboard",
      ecommerce: "webbshop",
      "blog-portfolio": "blogg eller portfolio",
      components: "komponent",
      "login-signup": "inloggningssida",
      animations: "animerad komponent",
    };
    return names[type] || type;
  };

  // Handle template generation with retry logic for missing chatId
  const handleTemplateGeneration = async (
    templateId: string,
    retryCount = 0
  ) => {
    const MAX_RETRIES = 2;

    if (retryCount === 0) {
      addMessage("assistant", `Laddar template: ${templateId}`);
    } else {
      console.log(
        `[ChatPanel] Retrying template load (attempt ${retryCount + 1}/${
          MAX_RETRIES + 1
        })`
      );
    }
    setLoading(true);

    try {
      // Skip cache on retry to force fresh v0 API call
      const response = await generateFromTemplate(
        templateId,
        quality,
        retryCount > 0
      );

      if (response.success) {
        // FIX: Validate chatId - critical for subsequent refinements
        if (!response.chatId) {
          console.error(
            "[ChatPanel] Template loaded without chatId - attempt",
            retryCount + 1
          );

          // Retry if we haven't exhausted retries
          if (retryCount < MAX_RETRIES) {
            setLoading(false);
            return handleTemplateGeneration(templateId, retryCount + 1);
          }

          // Final attempt failed - warn user but continue with demoUrl
          addMessage(
            "assistant",
            "⚠️ Template laddades men saknar chat-ID. Redigering kan vara begränsad. Prova ladda om sidan om problem uppstår."
          );
        }

        // Save chatId for subsequent refinements
        if (response.chatId) {
          setChatId(response.chatId);
          console.log("[ChatPanel] Template chatId set:", response.chatId);
        }

        // Save versionId (needed for download)
        if (response.versionId) {
          setVersionId(response.versionId);
        }

        // Save files from v0-sdk response
        if (response.files && response.files.length > 0) {
          setFiles(response.files);
        }

        // Save demo URL
        if (response.demoUrl) {
          setDemoUrl(response.demoUrl);
        }

        // Set the main code
        if (response.code) {
          setCurrentCode(response.code);
        }

        if (response.chatId) {
          addMessage(
            "assistant",
            response.message || "Template laddad! Du kan nu anpassa den."
          );
        }

        // NOTE: Auto-save disabled - user must manually save via header button
      } else {
        // Handle failed response
        console.error(
          "[ChatPanel] Template generation failed:",
          response.error
        );
        addMessage(
          "assistant",
          response.error || "Kunde inte ladda template. Försök igen."
        );
      }
    } catch (error) {
      console.error("[ChatPanel] Template generation error:", error);
      addMessage(
        "assistant",
        `Kunde inte ladda template: ${
          error instanceof Error ? error.message : "Okänt fel"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (prompt: string, type?: string) => {
    if (!isAuthenticated) {
      setAuthModalReason("generation");
      setShowAuthModal(true);
      return;
    }

    // Include uploaded files in prompt if any
    const filePromptText = filesToPromptText(uploadedFiles);
    // Include pending media from drawer
    const pendingMediaText = buildPendingMediaPrompt();
    const enhancedPrompt = prompt + filePromptText + pendingMediaText;

    // Create attachments from uploaded files for the message
    const fileAttachments = filesToAttachments(uploadedFiles);

    // Add pending media as attachments too
    const mediaAttachments: MessageAttachment[] = pendingMedia.map((item) => ({
      type: "image" as const,
      url: item.url,
      prompt: resolveMediaAttachmentPrompt(item),
    }));

    // Combine all attachments
    const allAttachments = [...fileAttachments, ...mediaAttachments];

    // Add user message with file attachments if any
    addMessage(
      "user",
      prompt,
      allAttachments.length > 0 ? allAttachments : undefined
    );

    // Clear uploaded files and pending media after sending
    if (uploadedFiles.length > 0) {
      setUploadedFiles([]);
    }
    if (pendingMedia.length > 0) {
      setPendingMedia([]);
    }

    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(enhancedPrompt.length);
    setIsRefinementMode(false);
    setThinkingSteps([]); // Clear previous thinking steps
    setStreamingMessage(""); // Clear streaming message

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // UNIVERSAL GATEKEEPER with STREAMING: ALL prompts go through orchestrator
      // Uses SSE for real-time thinking/progress updates
      // ═══════════════════════════════════════════════════════════════════════

      // Get fresh state from store (avoid stale React hook values)
      const latestState = useBuilderStore.getState();
      const currentFiles = latestState.files;

      console.log(
        "[ChatPanel] Initial generation via streaming orchestrator:",
        {
          promptPreview: enhancedPrompt.slice(0, 80) + "...",
          type,
          quality,
          hasFiles: !!currentFiles?.length,
        }
      );

      // Collect media library info
      // IMPORTANT: Include pendingMedia so selected images are passed to v0 with proper URLs
      const mediaLibraryForPrompt: MediaLibraryItem[] = [
        // Existing media bank items
        ...mediaBank.items
          .filter((item) => item.url)
          .map((item) => ({
            url: item.url,
            filename: item.filename || "unknown",
            description: item.description || item.prompt,
          })),
        // Pending media selected for this message (crucial for image integration)
        ...pendingMedia
          .filter((item) => item.url)
          .map((item) => ({
            url: item.url,
            filename: item.filename || item.type || "selected-image",
            description:
              item.prompt || `Vald ${item.type || "bild"} att integrera`,
          })),
      ];

      // FIX: Pass existing chatId/code if present (from template or saved project)
      const existingChatId = latestState.chatId;
      const existingCode = latestState.currentCode;

      if (existingChatId || existingCode) {
        console.log("[ChatPanel] handleGenerate: Using existing state", {
          chatId: existingChatId || "(none)",
          hasCode: !!existingCode,
        });
      }

      // Try streaming endpoint first, fall back to regular endpoint on error
      let response: ApiOrchestratorResponse | null = null;

      try {
        // Build previousClarify context if user is responding to a clarify question
        const previousClarifyContext = previousClarify
          ? {
              originalPrompt: previousClarify.originalPrompt,
              clarifyQuestion: previousClarify.clarifyQuestion,
              userResponse: prompt, // Current prompt is the user's response
            }
          : undefined;

        response = await fetchWithStreaming(
          "/api/orchestrate/stream",
          {
            prompt: enhancedPrompt,
            quality,
            existingChatId: existingChatId || undefined,
            existingCode: existingCode || undefined,
            projectId: latestState.projectId || undefined,
            projectFiles:
              currentFiles && currentFiles.length > 0
                ? currentFiles
                : undefined,
            mediaLibrary:
              mediaLibraryForPrompt.length > 0
                ? mediaLibraryForPrompt
                : undefined,
            categoryType: categoryType || undefined,
            previousClarify: previousClarifyContext,
          },
          (thought) => setThinkingSteps((prev) => [...prev, thought]),
          (step) => setStreamingMessage(step)
        );
      } catch (streamError) {
        const errorMsg =
          streamError instanceof Error ? streamError.message : "Unknown error";
        const isIncompleteStream = errorMsg.includes("No complete event");
        const isTimeout =
          errorMsg.includes("timeout") || errorMsg.includes("aborted");

        // Downgrade known transient SSE issues to warnings to avoid noisy dev overlays
        if (isIncompleteStream || isTimeout) {
          console.warn("[ChatPanel] Streaming incomplete:", errorMsg);
        } else {
          console.error("[ChatPanel] Streaming failed:", errorMsg);
        }

        // If it was a timeout or "no complete event", the generation might have succeeded
        // on the server but we just didn't receive it. Don't start a new generation.
        if (isIncompleteStream || isTimeout) {
          console.warn(
            "[ChatPanel] Generation may have completed on server. Refreshing project..."
          );

          // Try to reload project data to see if it was updated
          const projectId = useBuilderStore.getState().projectId;
          if (projectId) {
            try {
              const projectRes = await fetch(`/api/projects/${projectId}`);
              const projectJson = await projectRes.json();
              const data = projectJson?.data;
              if (data?.chat_id && data?.demo_url) {
                console.log("[ChatPanel] Found updated project data, using it");
                // Use the saved project data
                response = {
                  success: true,
                  intent: "simple_code",
                  code: data.current_code || "",
                  files: Array.isArray(data.files) ? data.files : [],
                  chatId: data.chat_id,
                  demoUrl: data.demo_url,
                  screenshotUrl: data.screenshot_url,
                  versionId: data.version_id,
                } as ApiOrchestratorResponse;
              } else {
                throw new Error("Project not updated, need to retry");
              }
            } catch {
              // Project wasn't updated, fall through to regular endpoint
              console.warn(
                "[ChatPanel] Project not updated, falling back to regular endpoint"
              );
            }
          }
        }

        // If we still don't have a response, fall back to regular endpoint
        if (!response) {
          console.warn("[ChatPanel] Falling back to regular endpoint");
          // Build previousClarify context if user is responding to a clarify question
          const previousClarifyContext = previousClarify
            ? {
                originalPrompt: previousClarify.originalPrompt,
                clarifyQuestion: previousClarify.clarifyQuestion,
                userResponse: prompt, // Current prompt is the user's response
              }
            : undefined;

          response = (await fetch("/api/orchestrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: enhancedPrompt,
              quality,
              existingChatId: existingChatId || undefined,
              existingCode: existingCode || undefined,
              projectId: latestState.projectId || undefined,
              projectFiles:
                currentFiles && currentFiles.length > 0
                  ? currentFiles
                  : undefined,
              mediaLibrary:
                mediaLibraryForPrompt.length > 0
                  ? mediaLibraryForPrompt
                  : undefined,
              categoryType: categoryType || undefined,
              previousClarify: previousClarifyContext,
            }),
          }).then((res) => res.json())) as ApiOrchestratorResponse;
        }
      }

      if (!response) {
        throw new Error("No orchestrator response received");
      }

      // Build attachments from orchestrator results
      const attachments: MessageAttachment[] = [];

      // Add workflow steps (use Array.isArray for type safety)
      if (
        Array.isArray(response.workflowSteps) &&
        response.workflowSteps.length > 0
      ) {
        attachments.push({
          type: "workflow",
          steps: response.workflowSteps,
        });
      }

      // Add web search results
      if (
        Array.isArray(response.webSearchResults) &&
        response.webSearchResults.length > 0
      ) {
        attachments.push({
          type: "web_search",
          results: response.webSearchResults,
        });
      }

      // Add generated images to attachments AND media bank
      if (
        Array.isArray(response.generatedImages) &&
        response.generatedImages.length > 0
      ) {
        for (const img of response.generatedImages) {
          attachments.push({
            type: "image",
            base64: img.base64,
            prompt: img.prompt,
            url: img.url,
          });
          // Only add to media bank if we have base64 data
          if (img.base64) {
            mediaBank.addGeneratedImage({
              base64: img.base64,
              prompt: img.prompt,
              url: img.url,
            });
          }
        }
      }

      // Show orchestrator results with attachments
      if (attachments.length > 0) {
        addMessage("assistant", response.message, attachments);
      } else if (response.message) {
        addMessage("assistant", response.message);
      }

      // ═══════════════════════════════════════════════════════════════════
      // SMART: Only update code/preview if intent involves code changes
      // ═══════════════════════════════════════════════════════════════════
      const codeChangingIntents = [
        "simple_code",
        "needs_code_context",
        "image_and_code",
        "web_and_code",
      ];
      const shouldUpdateCode =
        !response.intent || codeChangingIntents.includes(response.intent);

      console.log(
        "[ChatPanel] Gatekeeper result - intent:",
        response.intent,
        "shouldUpdateCode:",
        shouldUpdateCode
      );

      // Track intent for service suggestions
      if (response.intent) {
        setLastIntent(response.intent as string);
        // Clear any previous clarify options
        setClarifyOptions([]);
      }

      // Remember clarify context so the next user reply includes history
      if (response.intent === "clarify") {
        setPreviousClarify({
          originalPrompt: prompt,
          clarifyQuestion:
            response.clarifyQuestion ||
            response.message ||
            "Kan du förtydliga vad du menar?",
        });
      } else {
        setPreviousClarify(null);
      }

      if (shouldUpdateCode && response.success) {
        if (response.chatId) setChatId(response.chatId);
        if (response.demoUrl) setDemoUrl(response.demoUrl);
        if (response.screenshotUrl) setScreenshotUrl(response.screenshotUrl);
        if (response.versionId) setVersionId(response.versionId);
        if (response.files && response.files.length > 0)
          setFiles(response.files);
        if (response.code) setCurrentCode(response.code);

        // NOTE: Auto-save disabled - user must manually save via header button
      }

      // Update diamond balance regardless of intent
      if (response.balance !== undefined) {
        updateDiamonds(response.balance);
      }

      // Handle errors
      if (!response.success && !response.message) {
        if (response.requireAuth) {
          setAuthModalReason("generation");
          setShowAuthModal(true);
        } else if (response.requireCredits) {
          setAuthModalReason("credits");
          setShowAuthModal(true);
        } else {
          const errorMsg = response.error || "Något gick fel. Försök igen.";
          console.error("[ChatPanel] Generation failed:", errorMsg);
          addMessage("assistant", errorMsg);
        }
      }
    } catch (error) {
      console.error("[ChatPanel] Generation error:", error);
      addMessage("assistant", "Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
      setThinkingSteps([]);
      setStreamingMessage("");
    }
  };

  const handleRefinement = async (instruction: string) => {
    if (!isAuthenticated) {
      setAuthModalReason("refine");
      setShowAuthModal(true);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // IMPORTANT: Use getState() to get the CURRENT value from Zustand store
    // React state (currentCode) might be stale due to async batching
    // This is critical when handleRefinement is called immediately after
    // handleTemplateGeneration - React hasn't updated state yet!
    // ═══════════════════════════════════════════════════════════════════════
    const latestState = useBuilderStore.getState();
    const actualCurrentCode = latestState.currentCode;
    const actualChatId = latestState.chatId;

    // Debug: Log current state at refinement start
    console.log("[ChatPanel] handleRefinement - Store state:", {
      projectId: latestState.projectId,
      chatId: actualChatId || "(NONE - will create new chat!)",
      hasCode: !!actualCurrentCode,
      codeLength: actualCurrentCode?.length || 0,
      demoUrl: latestState.demoUrl?.slice(0, 50) || "(none)",
    });

    // Don't allow refinement if no code exists yet
    // Note: handleGenerate already adds the user message, so we only add assistant response
    if (!actualCurrentCode) {
      console.log(
        "[ChatPanel] No currentCode in store, falling back to generation"
      );
      // Treat as new generation instead (this will add the user message)
      handleGenerate(instruction);
      return;
    }

    // FIX: Better handling when chatId is missing
    // Instead of just warning, inform user but continue (v0 will create new conversation)
    if (!actualChatId) {
      console.warn(
        "[ChatPanel] Refining without chatId - will create new conversation"
      );
      // Don't block - v0 can handle this by creating a new conversation
      // But log prominently so we can debug if template loading fails
      console.log(
        "[ChatPanel] ⚠️ No chatId available. If this follows a template load, " +
          "there may be an issue with template caching or v0 API response."
      );
    }

    // Include uploaded files in instruction if any
    const filePromptText = filesToPromptText(uploadedFiles);
    // Include pending media from drawer
    const pendingMediaText = buildPendingMediaPrompt();
    const enhancedInstruction = instruction + filePromptText + pendingMediaText;

    // Create attachments from uploaded files for the message
    const fileAttachments = filesToAttachments(uploadedFiles);

    // Add pending media as attachments too
    const mediaAttachments: MessageAttachment[] = pendingMedia.map((item) => ({
      type: "image" as const,
      url: item.url,
      prompt: resolveMediaAttachmentPrompt(item),
    }));

    // Combine all attachments
    const allAttachments = [...fileAttachments, ...mediaAttachments];

    // Add user message with file attachments if any
    addMessage(
      "user",
      instruction,
      allAttachments.length > 0 ? allAttachments : undefined
    );

    // Clear uploaded files and pending media after sending
    if (uploadedFiles.length > 0) {
      setUploadedFiles([]);
    }
    if (pendingMedia.length > 0) {
      setPendingMedia([]);
    }

    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(enhancedInstruction.length);
    setIsRefinementMode(true);

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // UNIVERSAL GATEKEEPER: ALL prompts go through orchestrator
      // The orchestrator uses gpt-4o-mini (cheap) as semantic router to decide:
      // - image_gen: Generate image, add to media bank, NO v0 call
      // - chat_response: Just respond, NO v0 call
      // - clarify: Ask for clarification, NO v0 call
      // - web_search: Search and return, NO v0 call
      // - simple_code/needs_code_context/image_and_code/web_and_code: Call v0 for actual code changes
      // ═══════════════════════════════════════════════════════════════════════

      // Debug: Log what we're sending to orchestrate
      console.log("[ChatPanel] Refinement via universal gatekeeper:", {
        chatId: actualChatId || "(NEW - no existing chatId!)",
        hasCode: !!actualCurrentCode,
        codeLength: actualCurrentCode?.length || 0,
        promptPreview: enhancedInstruction.slice(0, 80) + "...",
      });

      // Collect media library info so orchestrator can pass to v0 if needed
      // IMPORTANT: Include pendingMedia so selected images are passed to v0 with proper URLs
      const mediaLibraryForPrompt: MediaLibraryItem[] = [
        // Existing media bank items
        ...mediaBank.items
          .filter((item) => item.url)
          .map((item) => ({
            url: item.url,
            filename: item.filename || "unknown",
            description: item.description || item.prompt,
          })),
        // Pending media selected for this message (crucial for image integration)
        ...pendingMedia
          .filter((item) => item.url)
          .map((item) => ({
            url: item.url,
            filename: item.filename || item.type || "selected-image",
            description:
              item.prompt || `Vald ${item.type || "bild"} att integrera`,
          })),
      ];

      // Get latest files from store (same pattern as actualCurrentCode)
      const actualFiles = latestState.files;

      const response: ApiOrchestratorResponse = await fetch(
        "/api/orchestrate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: enhancedInstruction,
            quality,
            existingChatId: actualChatId || undefined,
            existingCode: actualCurrentCode,
            // Pass project files for Code Crawler analysis
            projectFiles:
              actualFiles && actualFiles.length > 0 ? actualFiles : undefined,
            mediaLibrary:
              mediaLibraryForPrompt.length > 0
                ? mediaLibraryForPrompt
                : undefined,
          }),
        }
      ).then((res) => res.json());

      // Build attachments from orchestrator results
      const attachments: MessageAttachment[] = [];

      // Add workflow steps (use Array.isArray for type safety)
      if (
        Array.isArray(response.workflowSteps) &&
        response.workflowSteps.length > 0
      ) {
        attachments.push({
          type: "workflow",
          steps: response.workflowSteps,
        });
      }

      // Add web search results
      if (
        Array.isArray(response.webSearchResults) &&
        response.webSearchResults.length > 0
      ) {
        attachments.push({
          type: "web_search",
          results: response.webSearchResults,
        });
      }

      // Add generated images to attachments AND media bank
      if (
        Array.isArray(response.generatedImages) &&
        response.generatedImages.length > 0
      ) {
        for (const img of response.generatedImages) {
          attachments.push({
            type: "image",
            base64: img.base64,
            prompt: img.prompt,
            url: img.url, // Include blob URL if available
          });
          // Only add to media bank if we have base64 data
          if (img.base64) {
            mediaBank.addGeneratedImage({
              base64: img.base64,
              prompt: img.prompt,
              url: img.url,
            });
          }
        }
      }

      // Show orchestrator results with attachments
      if (attachments.length > 0) {
        addMessage("assistant", response.message, attachments);
      } else if (response.message) {
        // Show message without attachments (e.g., clarify, chat_response)
        addMessage("assistant", response.message);
      }

      // ═══════════════════════════════════════════════════════════════════
      // SMART: Only update code/preview if intent involves code changes
      // ═══════════════════════════════════════════════════════════════════
      const codeChangingIntents = [
        "simple_code",
        "needs_code_context",
        "image_and_code",
        "web_and_code",
      ];
      const shouldUpdateCode =
        !response.intent || codeChangingIntents.includes(response.intent);

      console.log(
        "[ChatPanel] Gatekeeper result - intent:",
        response.intent,
        "shouldUpdateCode:",
        shouldUpdateCode
      );

      // Track intent for service suggestions
      if (response.intent) {
        setLastIntent(response.intent as string);
        // Clear any previous clarify options
        setClarifyOptions([]);
      }

      // Remember clarify context so the next user reply includes history
      if (response.intent === "clarify") {
        setPreviousClarify({
          originalPrompt: instruction,
          clarifyQuestion:
            response.clarifyQuestion ||
            response.message ||
            "Kan du förtydliga vad du menar?",
        });
      } else {
        setPreviousClarify(null);
      }

      if (shouldUpdateCode && response.success) {
        // Update code-related data
        if (response.chatId) setChatId(response.chatId);
        if (response.demoUrl) setDemoUrl(response.demoUrl);
        if (response.screenshotUrl) setScreenshotUrl(response.screenshotUrl);
        if (response.versionId) setVersionId(response.versionId);
        if (response.files && response.files.length > 0)
          setFiles(response.files);
        if (response.code) setCurrentCode(response.code);

        // NOTE: Auto-save disabled - user must manually save via header button
      }

      // Update diamond balance regardless of intent
      if (response.balance !== undefined) {
        updateDiamonds(response.balance);
      }

      // Handle errors
      if (!response.success && !response.message) {
        if (response.requireAuth) {
          setAuthModalReason("refine");
          setShowAuthModal(true);
        } else if (response.requireCredits) {
          setAuthModalReason("credits");
          setShowAuthModal(true);
        } else {
          addMessage(
            "assistant",
            response.error || "Något gick fel. Försök igen."
          );
        }
      }
    } catch (error) {
      console.error("Refinement error:", error);
      addMessage("assistant", "Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
      setThinkingSteps([]);
      setStreamingMessage("");
    }
  };

  // Keep ref updated with latest handleRefinement (avoids stale closure in useCallback)
  handleRefinementRef.current = handleRefinement;

  const handleSubmit = () => {
    // Use ref for synchronous check (prevents race condition from React batching)
    if (!input.trim() || isLoading || isSubmittingRef.current) return;

    // Clear typing detection to prevent interference with avatar
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;

    // Set synchronous flag immediately to prevent double-submit
    isSubmittingRef.current = true;

    // Clear service suggestions when user sends new message
    setLastIntent(null);
    setClarifyOptions([]);

    const message = input.trim();
    setInput("");

    // Wrap in async to reset flag after completion
    const executeSubmit = async () => {
      try {
        // ═══════════════════════════════════════════════════════════════════
        // SMART URL DETECTION: Handle v0 URLs pasted directly
        // User can paste:
        // - https://v0.app/templates/xxx → Load template
        // - https://v0.app/chat/xxx → Load from existing chat
        // - npx shadcn@latest add "https://..." → Extract and load
        // ═══════════════════════════════════════════════════════════════════

        // Check for npx shadcn command first
        if (isNpxShadcnCommand(message)) {
          const extractedUrl = extractUrlFromNpxCommand(message);
          if (extractedUrl) {
            const templateIdFromUrl = extractTemplateId(extractedUrl);
            if (templateIdFromUrl) {
              console.log(
                "[ChatPanel] Detected npx command, loading template:",
                templateIdFromUrl
              );
              // Save the original command in chat history for audit trail
              addMessage("user", message);
              addMessage("assistant", `Laddar template från npx-kommando...`);
              await handleTemplateGeneration(templateIdFromUrl);
              return;
            }
          }
        }

        // Check if message is a v0 URL
        if (isV0Url(message)) {
          const parsed = parseV0Url(message);
          if (parsed.id) {
            console.log("[ChatPanel] Detected v0 URL:", parsed);
            // Save the original URL in chat history for audit trail
            addMessage("user", message);
            addMessage("assistant", `Laddar från v0 ${parsed.type}...`);

            if (parsed.type === "template" || parsed.type === "chat") {
              await handleTemplateGeneration(parsed.id);
              return;
            } else if (parsed.type === "block") {
              // Block URLs might need special handling
              addMessage(
                "assistant",
                "Block-URL:er stöds ännu inte fullt ut. Försök med en template-URL istället."
              );
              return;
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // NORMAL FLOW: Handle regular prompts
        // ═══════════════════════════════════════════════════════════════════

        // IMPORTANT: If we have a templateId but no content yet, load the template first
        // This handles the case where auto-generation didn't run (e.g., hasExistingData was set incorrectly)
        if (messages.length === 0 && !demoUrl && !currentCode) {
          if (templateId) {
            // Load template first, then use the message as refinement
            console.log(
              "[ChatPanel] Loading template before user prompt:",
              templateId
            );
            await handleTemplateGeneration(templateId);

            // If user also provided a message, use it as refinement
            // Note: handleRefinement uses getState() to get the latest code,
            // so it will correctly see the template code that was just loaded
            if (message && message.length > 0) {
              // Verify template was actually loaded before refining
              const state = useBuilderStore.getState();
              if (state.currentCode) {
                console.log(
                  "[ChatPanel] Template loaded, applying refinement:",
                  message.substring(0, 50)
                );
                await handleRefinement(message);
              } else {
                console.warn(
                  "[ChatPanel] Template load didn't produce code, treating message as new generation"
                );
                await handleGenerate(message);
              }
            }
          } else {
            // Normal generation with user prompt
            await handleGenerate(message);
          }
        } else if (messages.length === 0) {
          // First message - check if we have existing content (template/saved project)
          const state = useBuilderStore.getState();
          const hasExistingContent = !!(
            state.chatId ||
            state.currentCode ||
            state.demoUrl
          );

          if (hasExistingContent) {
            // FIX: Use refinement when we have existing content
            // This preserves chatId from template/saved project
            console.log(
              "[ChatPanel] First message with existing content - using refinement"
            );
            await handleRefinement(message);
          } else {
            // Truly new generation
            await handleGenerate(message);
          }
        } else {
          // Subsequent messages - refinement
          await handleRefinement(message);
        }
      } finally {
        isSubmittingRef.current = false;
      }
    };

    executeSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Pending media attachments - media selected from drawer waiting to be included in next message
  const [pendingMedia, setPendingMedia] = useState<MediaItem[]>([]);

  const resolveMediaAttachmentPrompt = (item: MediaItem): string => {
    const description = item.description?.trim();
    if (description) {
      return description;
    }

    const generatedPrompt = item.prompt?.trim();
    if (generatedPrompt) {
      return generatedPrompt;
    }

    const filename = item.filename?.trim();
    if (filename) {
      return filename;
    }

    if (item.type === "logo") {
      return "Logo asset";
    }
    if (item.type === "video") {
      return "Video attachment";
    }
    return "Media attachment";
  };

  // Handle asset selection from UnifiedAssetModal
  // This replaces the old handleMediaFileSelect and handleTextContent functions
  const handleAssetSelect = useCallback(
    (prompt: string, asset?: { type?: string }) => {
      // Set the sophisticated prompt from UnifiedAssetModal
      setInput(prompt);
      setShowAssetModal(false);
      inputRef.current?.focus();

      // Auto-apply only for low-risk assets.
      // For sections/components, we prefer letting the user review the prompt first
      // (avoids accidental big changes and avoids sending unrelated questions to v0).
      const isSection = asset?.type === "section";
      if (!isSection && currentCode && chatId && prompt.trim()) {
        // Use ref to get latest handleRefinement without causing re-renders
        setTimeout(() => handleRefinementRef.current?.(prompt), 100);
      }
    },
    [currentCode, chatId]
  );

  // Remove pending media item
  const handleRemovePendingMedia = (mediaId: string) => {
    setPendingMedia((prev) => prev.filter((m) => m.id !== mediaId));
  };

  // Build prompt text from pending media
  const buildPendingMediaPrompt = (): string => {
    if (pendingMedia.length === 0) return "";

    const mediaLines = pendingMedia.map((item) => {
      const mediaType =
        item.type === "logo"
          ? "logo"
          : item.type === "video"
          ? "video"
          : "bild";
      const filename = item.filename || mediaType;
      return `[${mediaType}: ${filename}] ${item.url}`;
    });

    return `\n\nBifogade media:\n${mediaLines.join("\n")}`;
  };

  // Remove file from attachments
  const handleRemoveFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Show toolbar only when project has started (messages exist or demoUrl)
  const showToolbar = messages.length > 0 || demoUrl || currentCode;

  return (
    <div className="flex flex-col h-full">
      {/* Auth/Credits modal */}
      <RequireAuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          // Refresh user data after modal closes (in case they logged in)
          fetchUser();
        }}
        reason={authModalReason}
      />

      {/* Unified Asset Modal - fullscreen modal for sections/media/text/elements */}
      <UnifiedAssetModal
        isOpen={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        projectId={projectId || undefined}
        onAssetSelect={handleAssetSelect}
        disabled={isLoading}
      />

      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-300">Chatt</span>
        <HelpTooltip text="Här ser du konversationen med AI:n. Varje meddelande du skickar uppdaterar din webbplats. Tänk på det som att prata med en designer!" />
      </div>

      {/* Messages - improved mobile scrolling */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin overscroll-contain"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollBehavior: "smooth",
        }}
      >
        <div className="p-4 space-y-4 pb-safe">
          {/* Show loading when project is being prepared OR generation is pending */}
          {messages.length === 0 && !isLoading && isProjectDataLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-teal-600/20 border border-teal-500/30 mb-4 animate-pulse">
                <Sparkles className="h-8 w-8 text-teal-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">
                Förbereder projekt...
              </h3>
              <p className="text-sm text-gray-500 max-w-[250px]">
                Skapar projektmapp och laddar data
              </p>
            </div>
          ) : messages.length === 0 &&
            !isLoading &&
            initialPrompt &&
            !hasExistingData ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-teal-600/20 border border-teal-500/30 mb-4 animate-pulse">
                <Sparkles className="h-8 w-8 text-teal-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">
                Startar generering...
              </h3>
              <p className="text-sm text-gray-500 max-w-[250px]">
                AI:n förbereder din webbplats
              </p>
            </div>
          ) : messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <div className="p-4 bg-teal-600/20 border border-teal-500/30 mb-4 rounded-xl">
                <Sparkles className="h-8 w-8 text-teal-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">
                {categoryType
                  ? `Redo att skapa din ${getCategoryName(categoryType)}`
                  : "Vad vill du bygga?"}
              </h3>
              <p className="text-sm text-gray-500 max-w-[280px] mb-6">
                {categoryType
                  ? "AI:n kommer generera en professionell design åt dig"
                  : "Beskriv din webbplats eller välj ett förslag nedan"}
              </p>
              {/* Quick suggestions - v0-inspired */}
              <Suggestions
                suggestions={
                  categoryType && CATEGORY_SUGGESTIONS[categoryType]
                    ? CATEGORY_SUGGESTIONS[categoryType]
                    : DEFAULT_SUGGESTIONS
                }
                onSelect={(text) => {
                  setInput(text);
                  inputRef.current?.focus();
                }}
                disabled={isLoading}
                className="max-w-md justify-center"
              />
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  userSeed={userSeed}
                />
              ))}
              {isLoading && (
                <GenerationProgress
                  isLoading={isLoading}
                  promptLength={currentPromptLength}
                  isRefinement={isRefinementMode}
                  startTime={generationStartTime || undefined}
                  thinking={thinkingSteps}
                  streamingMessage={streamingMessage}
                />
              )}
              {/* Service suggestions based on last intent */}
              {!isLoading && lastIntent && messages.length > 0 && (
                <ServiceSuggestions
                  intent={lastIntent}
                  clarifyOptions={clarifyOptions}
                  onSelect={(prompt) => {
                    setInput(prompt);
                    inputRef.current?.focus();
                    // Clear intent to hide suggestions
                    setLastIntent(null);
                  }}
                  disabled={isLoading}
                  className="mt-3"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Input area with compact toolbar */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        {/* Media Bank - show generated AI images */}
        {mediaBank.items.length > 0 && (
          <MediaBank
            items={mediaBank.items}
            onRemove={mediaBank.removeItem}
            onUseInPrompt={(item) => {
              const imageRef = item.url
                ? `\n\nAnvänd denna bild: ${item.url}`
                : `\n\n[Genererad bild: ${item.prompt}]`;
              setInput((prev) => prev + imageRef);
            }}
            onAddToSite={async (item) => {
              let imageUrl = item.url;

              // Upload base64 images first
              if (!imageUrl && item.base64 && projectId) {
                try {
                  addMessage("assistant", "⏳ Laddar upp bild...");
                  const response = await fetch(`/api/images/save`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      images: [
                        {
                          base64: item.base64,
                          prompt: item.prompt || "AI-genererad bild",
                        },
                      ],
                      projectId,
                    }),
                  });
                  const result = await response.json();
                  if (result.success && result.images?.[0]?.url) {
                    imageUrl = result.images[0].url;
                    item.url = imageUrl;
                    addMessage("assistant", `✅ Bild uppladdad!`);
                  } else {
                    addMessage("assistant", "❌ Kunde inte ladda upp bilden.");
                    return;
                  }
                } catch (error) {
                  console.error("[MediaBank] Upload failed:", error);
                  addMessage("assistant", "❌ Uppladdning misslyckades.");
                  return;
                }
              }

              if (!imageUrl) return;

              // Let orchestrator + Code Crawler decide best placement
              const prompt = `Lägg till denna bild på lämplig plats i sajten: ${imageUrl}`;
              setInput(prompt);
              if (currentCode && chatId) {
                setTimeout(() => handleRefinement(prompt), 100);
              }
            }}
            disabled={isLoading}
          />
        )}

        {/* Attachment chips - show uploaded files compactly */}
        {uploadedFiles.length > 0 && (
          <AttachmentChips
            files={uploadedFiles}
            onRemove={handleRemoveFile}
            maxVisible={3}
          />
        )}

        {/* Pending media from drawer - show as compact chips */}
        {pendingMedia.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {pendingMedia.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 bg-teal-500/20 border border-teal-500/30 rounded-lg text-xs"
              >
                {/* Thumbnail */}
                {(item.type === "image" || item.type === "logo") &&
                  item.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.filename || "Media"}
                      className="w-6 h-6 rounded object-cover"
                    />
                  )}
                {item.type === "video" && (
                  <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center">
                    <ImageIcon className="h-3 w-3 text-gray-400" />
                  </div>
                )}
                <span className="text-teal-300 max-w-[100px] truncate">
                  {item.filename || item.type}
                </span>
                <button
                  onClick={() => handleRemovePendingMedia(item.id)}
                  className="text-teal-400 hover:text-white transition-colors"
                  aria-label={`Remove ${item.filename || item.type}`}
                  title={`Remove ${item.filename || item.type}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <span className="text-[10px] text-gray-500 self-center">
              Skriv hur du vill använda bilden/bilderna ↓
            </span>
          </div>
        )}

        {/* Toolbar buttons - asset modal and inspect mode */}
        {showToolbar && (
          <div className="flex items-center gap-2 sm:gap-1 pb-2 sm:pb-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAssetModal(true)}
              disabled={isLoading}
              className="h-10 sm:h-7 px-4 sm:px-3 text-sm sm:text-xs gap-2 sm:gap-1.5 text-gray-400 hover:text-white hover:bg-gray-800 active:bg-gray-700 touch-manipulation border border-gray-700/50 hover:border-teal-600/50 transition-all"
              title="Lägg till sektioner, media eller text"
            >
              <Blocks className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-teal-500" />
              <span>+ Lägg till</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleDesignMode()}
              disabled={isLoading || !demoUrl}
              className={`h-10 sm:h-7 px-4 sm:px-3 text-sm sm:text-xs gap-2 sm:gap-1.5 touch-manipulation border transition-all ${
                isDesignModeActive
                  ? "bg-purple-600/30 border-purple-500/50 text-purple-300 hover:bg-purple-600/40"
                  : "text-gray-400 hover:text-white hover:bg-gray-800 active:bg-gray-700 border-gray-700/50 hover:border-purple-500/50"
              }`}
              title="Inspect - välj element att ändra"
            >
              <MousePointer2
                className={`h-4 w-4 sm:h-3.5 sm:w-3.5 ${
                  isDesignModeActive ? "text-purple-400" : "text-purple-500"
                }`}
              />
              <span>Inspect</span>
            </Button>
          </div>
        )}

        {/* Input field with send button - optimized for mobile */}
        <div className="flex items-center gap-2 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg focus-within:border-teal-600/50 transition-colors">
          <input
            ref={inputRef}
            id={`chat-message-input-${instanceId}`}
            name={`chat-message-${instanceId}`}
            type="text"
            autoComplete="off"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck="true"
            enterKeyHint="send"
            inputMode="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            // Prevent iOS zoom on focus
            onFocus={(e) => {
              // Ensure input is visible above keyboard on mobile
              setTimeout(() => {
                e.target.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              }, 300);
            }}
            placeholder={
              messages.length === 0
                ? "Beskriv din webbplats..."
                : "Förfina designen..."
            }
            disabled={isLoading}
            className="flex-1 bg-transparent text-base sm:text-sm text-white placeholder:text-gray-500 outline-none min-h-[44px]"
            style={{
              // Prevent iOS text zoom
              fontSize: "16px",
              // Touch-friendly tap target
              WebkitTapHighlightColor: "transparent",
            }}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="h-11 w-11 sm:h-8 sm:w-8 p-0 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 flex-shrink-0 touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 sm:h-4 sm:w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-5 w-5 sm:h-4 sm:w-4" />
            )}
          </Button>
        </div>

        {/* Help text */}
        <p className="text-xs text-gray-600 text-center">
          {messages.length === 0
            ? "Tryck Enter för att generera"
            : "Tryck Enter eller klicka på knapparna ovan"}
        </p>
      </div>
    </div>
  );
}
