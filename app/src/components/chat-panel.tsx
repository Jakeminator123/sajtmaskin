"use client";

/**
 * ChatPanel Component 3.0
 * =======================
 *
 * Hanterar all AI-interaktion och kodgenerering.
 *
 * INGÅNGSVÄGAR:
 * 1. Template (v0 community) → /api/template → chatId + kod
 * 2. Lokal template → /api/local-template → chatId + kod
 * 3. Kategori (landing page, etc.) → initialPrompt → ny generation
 * 4. Sparad projekt → loadFromProject → befintlig chatId + kod
 * 5. Fri prompt → initialPrompt → ny generation
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

import { AttachmentChips } from "@/components/attachment-chips";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { ChatMessage } from "@/components/chat-message";
import { ComponentPicker } from "@/components/component-picker";
import {
  filesToAttachments,
  filesToPromptText,
  type UploadedFile,
} from "@/components/file-upload-zone";
import { GenerationProgress } from "@/components/generation-progress";
import { HelpTooltip } from "@/components/help-tooltip";
import { MediaBank, useMediaBank } from "@/components/media-bank";
import type { MediaItem } from "@/components/media-bank";
import { MediaDrawer } from "@/components/media-drawer";
import { TextUploader } from "@/components/text-uploader";
import { Button } from "@/components/ui/button";
import { useAvatar } from "@/contexts/AvatarContext";
import { generateFromTemplate } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-store";
import type { MediaLibraryItem } from "@/lib/prompt-utils";
import { useBuilderStore, type MessageAttachment } from "@/lib/store";
import {
  extractTemplateId,
  extractUrlFromNpxCommand,
  isNpxShadcnCommand,
  isV0Url,
  parseV0Url,
} from "@/lib/v0-url-parser";
import {
  ArrowUp,
  Blocks,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// GENERATION STATE using sessionStorage for persistence across Fast Refresh
// This is crucial because React StrictMode and mobile tab switching can cause
// multiple ChatPanel instances to run simultaneously
// ============================================================================
const GENERATION_STATE_KEY = "sajtmaskin_generation_state";

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
  localTemplateId?: string;
  instanceId?: string; // Unique ID to differentiate between desktop/mobile instances
  isPrimaryInstance?: boolean; // Only primary instance triggers generation (prevents duplicates)
  isProjectDataLoading?: boolean; // True while loading project data from database
  hasExistingData?: boolean; // True if project has saved data (skip auto-generation)
}

export function ChatPanel({
  categoryType,
  initialPrompt,
  templateId,
  localTemplateId,
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

  // Toolbar modals state
  const [showMediaDrawer, setShowMediaDrawer] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showComponentPicker, setShowComponentPicker] = useState(false);

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Media bank for generated images/videos
  const mediaBank = useMediaBank();

  // Avatar reactions for typing and generation
  const { triggerReaction } = useAvatar();
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
    explicitSave,
  } = useBuilderStore();

  // Handle user typing - avatar watches attentively
  const handleTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      triggerReaction("user_typing");
    }
  }, [triggerReaction]);

  const handleTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      triggerReaction("user_stopped_typing");
    }
  }, [triggerReaction]);

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

  // Avatar reacts to generation state changes
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (isLoading && !wasLoadingRef.current) {
      // Generation started
      triggerReaction("generation_start", "Nu skapar vi något fantastiskt! ✨");
    } else if (!isLoading && wasLoadingRef.current) {
      // Generation completed - check last message for success/error
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.content?.includes("gick fel")) {
        triggerReaction(
          "generation_error",
          "Oj, något gick snett! Försök igen."
        );
      } else if (demoUrl) {
        triggerReaction("generation_complete", "Tadaa! Din sajt är klar! 🎉");
      }
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, messages, demoUrl, triggerReaction]);

  // Synchronous ref for submit protection (prevents race conditions from React batching)
  const isSubmittingRef = useRef(false);

  // Track if initial generation has been triggered for THIS component instance
  // This prevents re-generation when component remounts (e.g., mobile tab switching)
  const hasInitialGeneratedRef = useRef(false);
  const lastGeneratedKeyRef = useRef<string | null>(null);

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
    }-${localTemplateId || ""}`;

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
        if (localTemplateId) {
          await handleLocalTemplateLoad(localTemplateId);
        } else if (templateId) {
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
    localTemplateId,
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

  // Handle local template loading via v0 API metadata
  const handleLocalTemplateLoad = async (templateId: string) => {
    // Statusmeddelande visas som assistant för att inte rubba "första user prompt"-logik.
    addMessage("assistant", `Laddar mall: ${templateId}`);
    setLoading(true);

    try {
      const response = await fetch(`/api/local-template?id=${templateId}`);
      const data = await response.json();

      if (!data.success || !data.template?.v0TemplateId) {
        addMessage(
          "assistant",
          data.error || "Kunde inte ladda mallens metadata. Försök igen."
        );
        return;
      }

      const templateName = data.template?.name || templateId;
      addMessage(
        "assistant",
        `Mall "${templateName}" hittad! Laddar från v0...`
      );

      const v0Response = await generateFromTemplate(
        data.template.v0TemplateId,
        quality
      );

      if (v0Response?.success) {
        // FIX: Validate chatId - critical for subsequent refinements
        if (!v0Response.chatId) {
          console.error(
            "[ChatPanel] Local template loaded without chatId - CRITICAL BUG"
          );
          addMessage(
            "assistant",
            "Mallen laddades men saknar chat-ID. Detta kan orsaka problem vid redigering."
          );
        }

        if (v0Response.chatId) {
          setChatId(v0Response.chatId);
        }
        if (v0Response.demoUrl) {
          setDemoUrl(v0Response.demoUrl);
        }
        if (
          v0Response.files &&
          Array.isArray(v0Response.files) &&
          v0Response.files.length > 0
        ) {
          setFiles(v0Response.files);
        }
        if (v0Response.versionId) {
          setVersionId(v0Response.versionId);
        }

        let codeToSet = v0Response.code;
        if (!codeToSet && v0Response.files && v0Response.files.length > 0) {
          const mainFile =
            v0Response.files.find(
              (f: { name: string; content: string }) =>
                f.name.includes("page.tsx") ||
                f.name.includes("Page.tsx") ||
                f.name.endsWith(".tsx")
            ) || v0Response.files[0];
          codeToSet = mainFile?.content || "";
        }
        if (codeToSet) {
          setCurrentCode(codeToSet);
        }

        addMessage(
          "assistant",
          "Mallen är redo! Du kan nu se preview och fortsätta anpassa den genom att skriva ändringar nedan."
        );

        if (projectId && (v0Response.demoUrl || codeToSet)) {
          explicitSave().catch((err) => {
            console.warn(
              "[ChatPanel] Auto-save efter template load misslyckades:",
              err
            );
          });
        }
      } else {
        const errorMsg = v0Response?.error || "Okänt fel";
        addMessage(
          "assistant",
          `Mallen kunde inte laddas: ${errorMsg}. Prova att ladda om sidan eller skriv en egen prompt.`
        );
      }
    } catch (error) {
      console.error("[ChatPanel] Local template load error:", error);
      addMessage(
        "assistant",
        `Kunde inte ladda mallen: ${
          error instanceof Error ? error.message : "Okänt fel"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle template generation
  const handleTemplateGeneration = async (templateId: string) => {
    addMessage("assistant", `Laddar template: ${templateId}`);
    setLoading(true);

    try {
      const response = await generateFromTemplate(templateId, quality);

      if (response.success) {
        // FIX: Validate chatId - critical for subsequent refinements
        if (!response.chatId) {
          console.error(
            "[ChatPanel] Template loaded without chatId - CRITICAL BUG"
          );
          addMessage(
            "assistant",
            "Template laddades men saknar chat-ID. Detta kan orsaka problem vid redigering. Prova ladda om sidan."
          );
          // Continue anyway - demoUrl might still work for preview
        }

        // Save chatId for subsequent refinements
        if (response.chatId) {
          setChatId(response.chatId);
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

        addMessage(
          "assistant",
          response.message || "Template laddad! Du kan nu anpassa den."
        );
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

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // UNIVERSAL GATEKEEPER: ALL prompts go through orchestrator
      // The orchestrator uses gpt-4o-mini (cheap) as semantic router to decide:
      // - image_only: Generate image, add to media bank, NO v0 call
      // - chat_response: Just respond, NO v0 call
      // - clarify: Ask for clarification, NO v0 call
      // - web_search_only: Search and return, NO v0 call
      // - code_only/image_and_code/web_and_code: Call v0 for actual code changes
      // ═══════════════════════════════════════════════════════════════════════

      // Get fresh state from store (avoid stale React hook values)
      const latestState = useBuilderStore.getState();
      const currentFiles = latestState.files;

      console.log("[ChatPanel] Initial generation via universal gatekeeper:", {
        promptPreview: enhancedPrompt.slice(0, 80) + "...",
        type,
        quality,
        hasFiles: !!currentFiles?.length,
      });

      // Collect media library info
      const mediaLibraryForPrompt: MediaLibraryItem[] = mediaBank.items
        .filter((item) => item.url)
        .map((item) => ({
          url: item.url,
          filename: item.filename || "unknown",
          description: item.description || item.prompt,
        }));

      // FIX: Pass existing chatId/code if present (from template or saved project)
      // This ensures refinement works correctly when user has loaded a template
      const existingChatId = latestState.chatId;
      const existingCode = latestState.currentCode;

      if (existingChatId || existingCode) {
        console.log("[ChatPanel] handleGenerate: Using existing state", {
          chatId: existingChatId || "(none)",
          hasCode: !!existingCode,
        });
      }

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          quality,
          // Pass existing state if available (template/saved project)
          existingChatId: existingChatId || undefined,
          existingCode: existingCode || undefined,
          // Pass project files for Code Crawler analysis (use fresh state)
          projectFiles:
            currentFiles && currentFiles.length > 0 ? currentFiles : undefined,
          mediaLibrary:
            mediaLibraryForPrompt.length > 0
              ? mediaLibraryForPrompt
              : undefined,
        }),
      }).then((res) => res.json());

      // Build attachments from orchestrator results
      const attachments: MessageAttachment[] = [];

      // Add workflow steps
      if (response.workflowSteps && response.workflowSteps.length > 0) {
        attachments.push({
          type: "workflow",
          steps: response.workflowSteps,
        });
      }

      // Add web search results
      if (response.webSearchResults && response.webSearchResults.length > 0) {
        attachments.push({
          type: "web_search",
          results: response.webSearchResults,
        });
      }

      // Add generated images to attachments AND media bank
      if (response.generatedImages && response.generatedImages.length > 0) {
        for (const img of response.generatedImages) {
          attachments.push({
            type: "image",
            base64: img.base64,
            prompt: img.prompt,
            url: img.url,
          });
          mediaBank.addGeneratedImage({
            base64: img.base64,
            prompt: img.prompt,
            url: img.url,
          });
        }
      }

      // Show orchestrator results with attachments
      if (attachments.length > 0) {
        addMessage("assistant", response.message || "✨ Klar!", attachments);
      } else if (response.message) {
        addMessage("assistant", response.message);
      }

      // ═══════════════════════════════════════════════════════════════════
      // SMART: Only update code/preview if intent involves code changes
      // ═══════════════════════════════════════════════════════════════════
      const codeChangingIntents = [
        "code_only",
        "image_and_code",
        "web_search_and_code",
      ];
      const shouldUpdateCode =
        !response.intent || codeChangingIntents.includes(response.intent);

      console.log(
        "[ChatPanel] Gatekeeper result - intent:",
        response.intent,
        "shouldUpdateCode:",
        shouldUpdateCode
      );

      if (shouldUpdateCode && response.success) {
        if (response.chatId) setChatId(response.chatId);
        if (response.demoUrl) setDemoUrl(response.demoUrl);
        if (response.screenshotUrl) setScreenshotUrl(response.screenshotUrl);
        if (response.versionId) setVersionId(response.versionId);
        if (response.files && response.files.length > 0)
          setFiles(response.files);
        if (response.code) setCurrentCode(response.code);

        // AUTO-SAVE
        if (projectId && (response.demoUrl || response.code)) {
          explicitSave().catch((err) => {
            console.warn("[ChatPanel] Auto-save after generation failed:", err);
          });
        }
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
      addMessage(
        "assistant",
        "Ingen kod finns ännu att förfina. Genererar en ny design baserat på din beskrivning..."
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
      // - image_only: Generate image, add to media bank, NO v0 call
      // - chat_response: Just respond, NO v0 call
      // - clarify: Ask for clarification, NO v0 call
      // - web_search_only: Search and return, NO v0 call
      // - code_only/image_and_code/web_and_code: Call v0 for actual code changes
      // ═══════════════════════════════════════════════════════════════════════

      // Debug: Log what we're sending to orchestrate
      console.log("[ChatPanel] Refinement via universal gatekeeper:", {
        chatId: actualChatId || "(NEW - no existing chatId!)",
        hasCode: !!actualCurrentCode,
        codeLength: actualCurrentCode?.length || 0,
        promptPreview: enhancedInstruction.slice(0, 80) + "...",
      });

      // Collect media library info so orchestrator can pass to v0 if needed
      const mediaLibraryForPrompt: MediaLibraryItem[] = mediaBank.items
        .filter((item) => item.url)
        .map((item) => ({
          url: item.url,
          filename: item.filename || "unknown",
          description: item.description || item.prompt,
        }));

      // Get latest files from store (same pattern as actualCurrentCode)
      const actualFiles = latestState.files;

      const response = await fetch("/api/orchestrate", {
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
      }).then((res) => res.json());

      // Build attachments from orchestrator results
      const attachments: MessageAttachment[] = [];

      // Add workflow steps
      if (response.workflowSteps && response.workflowSteps.length > 0) {
        attachments.push({
          type: "workflow",
          steps: response.workflowSteps,
        });
      }

      // Add web search results
      if (response.webSearchResults && response.webSearchResults.length > 0) {
        attachments.push({
          type: "web_search",
          results: response.webSearchResults,
        });
      }

      // Add generated images to attachments AND media bank
      if (response.generatedImages && response.generatedImages.length > 0) {
        for (const img of response.generatedImages) {
          attachments.push({
            type: "image",
            base64: img.base64,
            prompt: img.prompt,
            url: img.url, // Include blob URL if available
          });
          // Also add to media bank for later use
          mediaBank.addGeneratedImage({
            base64: img.base64,
            prompt: img.prompt,
            url: img.url,
          });
        }
      }

      // Show orchestrator results with attachments
      if (attachments.length > 0) {
        addMessage("assistant", response.message || "✨ Klar!", attachments);
      } else if (response.message) {
        // Show message without attachments (e.g., clarify, chat_response)
        addMessage("assistant", response.message);
      }

      // ═══════════════════════════════════════════════════════════════════
      // SMART: Only update code/preview if intent involves code changes
      // ═══════════════════════════════════════════════════════════════════
      const codeChangingIntents = [
        "code_only",
        "image_and_code",
        "web_search_and_code",
      ];
      const shouldUpdateCode =
        !response.intent || codeChangingIntents.includes(response.intent);

      console.log(
        "[ChatPanel] Gatekeeper result - intent:",
        response.intent,
        "shouldUpdateCode:",
        shouldUpdateCode
      );

      if (shouldUpdateCode && response.success) {
        // Update code-related data
        if (response.chatId) setChatId(response.chatId);
        if (response.demoUrl) setDemoUrl(response.demoUrl);
        if (response.screenshotUrl) setScreenshotUrl(response.screenshotUrl);
        if (response.versionId) setVersionId(response.versionId);
        if (response.files && response.files.length > 0)
          setFiles(response.files);
        if (response.code) setCurrentCode(response.code);

        // AUTO-SAVE: Save to database after code changes
        if (projectId && (response.demoUrl || response.code)) {
          explicitSave().catch((err) => {
            console.warn("[ChatPanel] Auto-save after refinement failed:", err);
          });
        }
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
    }
  };

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
          } else if (localTemplateId) {
            // Load local template first
            console.log(
              "[ChatPanel] Loading local template before user prompt:",
              localTemplateId
            );
            await handleLocalTemplateLoad(localTemplateId);

            // Same verification for local templates
            if (message && message.length > 0) {
              const state = useBuilderStore.getState();
              if (state.currentCode) {
                console.log(
                  "[ChatPanel] Local template loaded, applying refinement"
                );
                await handleRefinement(message);
              } else {
                console.warn(
                  "[ChatPanel] Local template load didn't produce code, treating as new generation"
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

  // Handle component selection from picker - add to input, let user customize
  const handleComponentSelect = (prompt: string) => {
    setInput(prompt);
    setShowComponentPicker(false);
    inputRef.current?.focus();
    // DON'T auto-submit - let user customize the prompt if they want
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

  // Handle media file selection from drawer - NOW just adds to pending, no auto-submit
  const handleMediaFileSelect = (item: import("./media-bank").MediaItem) => {
    if (!item.url) return;

    // Add to pending media (don't auto-submit)
    setPendingMedia((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.url === item.url)) return prev;
      return [...prev, item];
    });

    // Close drawer and focus input so user can write their own prompt
    setShowMediaDrawer(false);
    inputRef.current?.focus();
  };

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

  // Handle text file content - add to input, let user edit and submit
  const handleTextContent = (content: string, filename: string) => {
    // Truncate if too long, orchestrator handles the rest
    const truncated =
      content.length > 6000 ? content.slice(0, 6000) + "..." : content;

    // Create a prompt that lets orchestrator + Code Crawler decide placement
    // DON'T auto-submit - let user edit the prompt first
    const prompt = `Använd innehållet från filen "${filename}" på lämplig plats i sajten:\n\n${truncated}`;

    setInput(prompt);
    inputRef.current?.focus();
    setShowTextModal(false);
    // User can now edit the prompt and submit when ready
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

      {/* Media Drawer */}
      <MediaDrawer
        isOpen={showMediaDrawer}
        onClose={() => setShowMediaDrawer(false)}
        projectId={projectId || undefined}
        onFileSelect={handleMediaFileSelect}
      />

      {/* Text Uploader (Simplified) */}
      <TextUploader
        isOpen={showTextModal}
        onClose={() => setShowTextModal(false)}
        onContentReady={handleTextContent}
        disabled={isLoading}
      />

      {/* Component Picker Modal */}
      {showComponentPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setShowComponentPicker(false)}
          />
          <div className="relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0">
            <ComponentPicker
              onSelect={handleComponentSelect}
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-300">Chatt</span>
        <HelpTooltip text="Här ser du konversationen med AI:n. Varje meddelande du skickar uppdaterar din webbplats. Tänk på det som att prata med en designer!" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 bg-teal-600/20 border border-teal-500/30 mb-4">
                <Sparkles className="h-8 w-8 text-teal-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-200 mb-2">
                {categoryType
                  ? `Redo att skapa din ${getCategoryName(categoryType)}`
                  : "Beskriv din vision"}
              </h3>
              <p className="text-sm text-gray-500 max-w-[250px]">
                {categoryType
                  ? "AI:n kommer generera en professionell design åt dig"
                  : "Skriv vad du vill bygga så skapar AI:n det åt dig"}
              </p>
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

        {/* Toolbar buttons - only show when project has started */}
        {showToolbar && (
          <div className="flex items-center gap-1 pb-1">
            {/* Components button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowComponentPicker(true)}
              disabled={isLoading}
              className="h-7 px-2 text-xs gap-1 text-gray-400 hover:text-white hover:bg-gray-800"
              title="Lägg till UI-komponenter"
            >
              <Blocks className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">+Sektion</span>
            </Button>

            {/* Media button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowMediaDrawer(true)}
              disabled={isLoading || !isAuthenticated}
              className="h-7 px-2 text-xs gap-1 text-gray-400 hover:text-white hover:bg-gray-800"
              title={
                !isAuthenticated
                  ? "Logga in för mediabibliotek"
                  : "Ladda upp bilder & videos"
              }
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Media</span>
            </Button>

            {/* Text/PDF button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowTextModal(true)}
              disabled={isLoading}
              className="h-7 px-2 text-xs gap-1 text-gray-400 hover:text-white hover:bg-gray-800"
              title="Ladda upp text från fil"
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Text</span>
            </Button>
          </div>
        )}

        {/* Input field with send button */}
        <div className="flex items-center gap-2 p-3 bg-gray-800/50 border border-gray-700/50 rounded-lg focus-within:border-teal-600/50 transition-colors">
          <input
            ref={inputRef}
            id={`chat-message-input-${instanceId}`}
            name={`chat-message-${instanceId}`}
            type="text"
            autoComplete="off"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              messages.length === 0
                ? "Beskriv din webbplats..."
                : "Förfina designen eller lägg till komponenter..."
            }
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 p-0 bg-teal-600 hover:bg-teal-500 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
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
