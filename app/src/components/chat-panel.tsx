"use client";

/**
 * ChatPanel Component
 * ===================
 *
 * Hanterar all AI-interaktion och kodgenerering.
 *
 * TRE HUVUDFLÖDEN:
 *
 * 1. EGEN PROMPT (initialPrompt):
 *    → generateWebsite(prompt) → v0 API → demoUrl + kod
 *
 * 2. V0 COMMUNITY TEMPLATE (templateId):
 *    → generateFromTemplate(templateId) → v0 API → demoUrl + kod
 *    → Används för externa v0-mallar (ej lokala)
 *
 * 3. LOKAL MALL (localTemplateId):
 *    a) Om mallen har v0TemplateId:
 *       → generateFromTemplate() → v0 API direkt (bästa kvalitet)
 *    b) Annars:
 *       → Läs lokal kod → Skicka till generateWebsite() → v0 återskapar
 *
 * REFINEMENT (förfining av existerande kod):
 *    → refineWebsite(kod, instruktion, chatId) → v0 API → uppdaterad demoUrl
 *    → Använder samma chatId för konversationskontext
 *
 * VIKTIGT: Alla vägar leder till v0 API som ger oss demoUrl för iframe-preview.
 * Sandpack används ALDRIG för generering, endast som fallback för visning.
 */

import { useEffect, useRef, useState, KeyboardEvent, useCallback } from "react";
import { useBuilderStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
import { useAvatar } from "@/contexts/AvatarContext";
import {
  generateWebsite, // Generera från prompt eller kod
  refineWebsite, // Förfina existerande design
  generateFromTemplate, // Ladda v0 community template
} from "@/lib/api-client";
import { ChatMessage } from "@/components/chat-message";
import { HelpTooltip } from "@/components/help-tooltip";
import { ComponentPicker } from "@/components/component-picker";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { GenerationProgress } from "@/components/generation-progress";
import { DomainSuggestions } from "@/components/domain-suggestions";
import { VideoGenerator } from "@/components/video-generator";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  ArrowUp,
  Loader2,
  Sparkles,
  Globe,
  Video,
  Image as ImageIcon,
} from "lucide-react";

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
const SAME_KEY_COOLDOWN_MS = 120000; // 2 minutes cooldown for same key

function canStartGeneration(key: string): boolean {
  const state = getGenerationState();
  const now = Date.now();

  // If generation is in progress but took too long, allow new one
  if (state.inProgress && now - state.timestamp > GENERATION_TIMEOUT_MS) {
    console.log("[ChatPanel] Generation timed out, allowing new one");
    setGenerationState({ ...state, inProgress: false });
    return true;
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
  previewChatId?: string; // Reuse chatId from preview (for seamless template loading)
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
  previewChatId,
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
  const [refinementCount, setRefinementCount] = useState(0);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [projectName, setProjectName] = useState("");
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

  const { updateDiamonds, fetchUser, diamonds, isAuthenticated } = useAuth();

  // Advanced tools state (available after project takeover)
  const [selectedAdvancedTool, setSelectedAdvancedTool] =
    useState<AdvancedTool | null>(null);
  const [showVideoGenerator, setShowVideoGenerator] = useState(false);

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
    isProjectOwned,
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
  // Abort controller for canceling previous requests
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Handle local template loading
  // Instead of rendering in Sandpack (which fails due to missing deps),
  // we load the template code and then use v0 API to generate a hosted preview
  const handleLocalTemplateLoad = async (templateId: string) => {
    addMessage("user", `Laddar mall: ${templateId}`);
    setLoading(true);

    try {
      // If we have a previewChatId, we already have a v0 session - just fetch the details
      if (previewChatId) {
        console.log("[ChatPanel] Reusing preview chatId:", previewChatId);
        addMessage("assistant", `Återanvänder förhandsgranskad session...`);

        // Fetch full template data to get files and demoUrl
        const v0Response = await generateFromTemplate(
          // Get the v0TemplateId from local-template API
          (
            await fetch(`/api/local-template?id=${templateId}`).then((r) =>
              r.json()
            )
          ).template?.v0TemplateId || templateId,
          quality
        );

        if (v0Response?.success) {
          if (v0Response.chatId) setChatId(v0Response.chatId);
          if (v0Response.demoUrl) setDemoUrl(v0Response.demoUrl);
          if (v0Response.files?.length) setFiles(v0Response.files);
          if (v0Response.versionId) setVersionId(v0Response.versionId);

          const mainCode =
            v0Response.code ||
            v0Response.files?.find(
              (f: { name: string; content: string }) =>
                f.name.includes("page.tsx") || f.name.endsWith(".tsx")
            )?.content ||
            "";

          if (mainCode) setCurrentCode(mainCode);

          addMessage(
            "assistant",
            `Mallen är redo! Du kan nu förfina den genom att skriva ändringar nedan.`
          );
        } else {
          addMessage(
            "assistant",
            v0Response?.error || "Kunde inte ladda mallen."
          );
        }
        return;
      }

      const response = await fetch(`/api/local-template?id=${templateId}`);
      const data = await response.json();

      if (!data.success) {
        addMessage(
          "assistant",
          data.error || "Kunde inte ladda mallen. Försök igen."
        );
        return;
      }

      let v0Response;

      // SMART: If template signals useV0Api (has v0TemplateId, no local files)
      // → Skip file handling, go directly to v0 API
      if (data.useV0Api && data.template?.v0TemplateId) {
        addMessage(
          "assistant",
          `Mall "${data.template.name}" hittad! Laddar från v0 direkt...`
        );

        v0Response = await generateFromTemplate(
          data.template.v0TemplateId,
          quality
        );

        // Skip to result handling below
      } else {
        // Normal flow: Template has local files

        // Get the main code from template
        let mainCode = data.code;
        if (!mainCode && data.files && data.files.length > 0) {
          const mainFile = data.files.find(
            (f: { name: string; content: string }) =>
              f.name === "page.tsx" ||
              f.name === "App.tsx" ||
              f.name.endsWith("/page.tsx")
          );
          mainCode = mainFile?.content || "";
        }

        if (!mainCode) {
          addMessage("assistant", "Kunde inte hitta mallens huvudfil.");
          return;
        }

        // Save files locally for code view
        if (data.files && data.files.length > 0) {
          setFiles(data.files);
        }
        setCurrentCode(mainCode);

        // Show progress to user
        addMessage(
          "assistant",
          `Mall "${
            data.template?.name || templateId
          }" hittad! Genererar live preview...`
        );

        // SMART APPROACH: Try v0 template ID first if available (much better quality!)
        if (data.template?.v0TemplateId) {
          addMessage("assistant", "Laddar från v0 direkt (bästa kvalitet)...");
          v0Response = await generateFromTemplate(
            data.template.v0TemplateId,
            quality
          );
        }

        // Fallback: Use code-based approach if v0TemplateId failed or doesn't exist
        if (!v0Response?.success) {
          try {
            // Use a STRICT prompt to recreate as faithfully as possible
            const templatePrompt = `RECREATE this React component as EXACTLY as possible.

STRICT REQUIREMENTS:
1. Generate a SINGLE self-contained React component (no external imports)
2. PRESERVE ALL visual elements: colors, gradients, shadows, animations
3. PRESERVE the exact layout, spacing, and typography
4. PRESERVE all SVG elements and their animations (animateMotion, keyframes, etc.)
5. PRESERVE all CSS styles including @keyframes animations
6. You CAN use: react, lucide-react, framer-motion/motion, tailwindcss
7. If the code has SVG paths/shapes, include them EXACTLY as shown

This is the EXACT code to recreate - do NOT simplify or change the design:

${mainCode.substring(0, 18000)}`;

            v0Response = await generateWebsite(
              templatePrompt,
              undefined,
              quality
            );
          } catch (fallbackError) {
            console.error(
              "[ChatPanel] Fallback generation also failed:",
              fallbackError
            );
            v0Response = {
              success: false,
              error: `Både v0 template och fallback-generering misslyckades: ${
                fallbackError instanceof Error
                  ? fallbackError.message
                  : "Okänt fel"
              }`,
            };
          }
        }
      } // Close else block

      // Handle v0 response (for both direct API and local-to-v0 flow)
      if (v0Response?.success) {
        // Save the v0 response to state (only set if values exist)
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

        // IMPORTANT: Set currentCode for refinement to work!
        // Try code first, then extract from files if needed
        let codeToSet = v0Response.code;
        if (!codeToSet && v0Response.files && v0Response.files.length > 0) {
          // Find main file and extract code
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
          `Mallen är redo! Du kan nu se preview och fortsätta anpassa den genom att skriva ändringar nedan.`
        );

        // AUTO-SAVE: Save to database after successful template load
        if (projectId && (v0Response.demoUrl || codeToSet)) {
          explicitSave().catch((err) => {
            console.warn(
              "[ChatPanel] Auto-save after template load failed:",
              err
            );
          });
        }
      } else {
        // Fallback: v0 API failed
        const errorMsg = v0Response?.error || "Okänt fel";

        // For TYP A templates (v0TemplateId only, no local files), provide fallback code
        // so the code view isn't empty
        if (data.useV0Api && !currentCode) {
          const fallbackCode = `// Mall: ${data.template?.name || templateId}
// 
// ⚠️ Kunde inte ladda mallen från v0 API.
// Fel: ${errorMsg}
// 
// Prova:
// 1. Ladda om sidan
// 2. Skriv en egen prompt för att generera innehåll
// 3. Välj en annan mall
//
// Template URL: ${data.template?.sourceUrl || "N/A"}
// Template ID: ${data.template?.v0TemplateId || "N/A"}

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-4">Mall kunde inte laddas</h1>
        <p className="text-gray-400">Prova att ladda om eller välj en annan mall.</p>
      </div>
    </div>
  );
}`;
          setCurrentCode(fallbackCode);
        }

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
    addMessage("user", `Laddar template: ${templateId}`);
    setLoading(true);

    try {
      const response = await generateFromTemplate(templateId, quality);

      if (response.success) {
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
    addMessage("user", prompt);
    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(prompt.length);
    setIsRefinementMode(false);

    try {
      // Ensure loading is set even if generateWebsite throws synchronously
      if (!isLoading) {
        setLoading(true);
      }
      const response = await generateWebsite(prompt, type, quality);

      if (response.success && response.message) {
        addMessage("assistant", response.message);

        // Save chatId for future refinements
        if (response.chatId) {
          setChatId(response.chatId);
        }

        // Save demoUrl for iframe preview (v0's hosted preview)
        if (response.demoUrl) {
          setDemoUrl(response.demoUrl);
        }

        // Save screenshotUrl for fallback preview
        if (response.screenshotUrl) {
          setScreenshotUrl(response.screenshotUrl);
        }

        // Save versionId for ZIP download
        if (response.versionId) {
          setVersionId(response.versionId);
        }

        // Save files if we got them
        if (response.files && response.files.length > 0) {
          setFiles(response.files);
        }

        // Set the main code
        if (response.code) {
          setCurrentCode(response.code);
        }

        // Update diamond balance if returned
        if (response.balance !== undefined) {
          updateDiamonds(response.balance);
        }

        // AUTO-SAVE: Save to database after successful generation
        // This ensures the user doesn't lose their work if they navigate away
        if (projectId && (response.demoUrl || response.code)) {
          explicitSave().catch((err) => {
            console.warn("[ChatPanel] Auto-save after generation failed:", err);
          });
        }
      } else {
        // Check if error is due to credits/auth
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
    // Don't allow refinement if no code exists yet
    // Note: handleGenerate already adds the user message, so we only add assistant response
    if (!currentCode) {
      addMessage(
        "assistant",
        "Ingen kod finns ännu att förfina. Genererar en ny design baserat på din beskrivning..."
      );
      // Treat as new generation instead (this will add the user message)
      handleGenerate(instruction);
      return;
    }

    // Warn if chatId is missing (refinement may create new conversation)
    if (!chatId) {
      console.warn(
        "[ChatPanel] Refining without chatId - will create new conversation"
      );
    }

    addMessage("user", instruction);
    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(instruction.length);
    setIsRefinementMode(true);

    try {
      // Pass chatId to continue the conversation with v0
      const response = await refineWebsite(
        currentCode,
        instruction,
        quality,
        chatId || undefined
      );

      if (response.success && response.message) {
        addMessage("assistant", response.message);

        // Track successful refinements for domain suggestion trigger
        const newCount = refinementCount + 1;
        setRefinementCount(newCount);

        // Show domain suggestions after 3 successful refinements
        if (newCount === 3) {
          // Extract project name from the first user message
          const firstUserMessage = messages.find((m) => m.role === "user");
          if (firstUserMessage) {
            // Try to extract company/project name from the prompt
            const nameMatch = firstUserMessage.content.match(
              /(?:för|for|called|named|om)\s+([A-Za-zÅÄÖåäö0-9\s]+?)(?:\.|,|med|with|som|that)/i
            );
            setProjectName(nameMatch?.[1]?.trim() || "");
          }
          // Auto-show domain modal
          setTimeout(() => setShowDomainModal(true), 1000);
        }

        // Update chatId if we got a new one
        if (response.chatId) {
          setChatId(response.chatId);
        }

        // Update demoUrl if we got a new one
        if (response.demoUrl) {
          setDemoUrl(response.demoUrl);
        }

        // Update screenshotUrl if we got a new one
        if (response.screenshotUrl) {
          setScreenshotUrl(response.screenshotUrl);
        }

        // Update versionId if we got a new one
        if (response.versionId) {
          setVersionId(response.versionId);
        }

        // Update files if we got them
        if (response.files && response.files.length > 0) {
          setFiles(response.files);
        }

        // Update the code
        if (response.code) {
          setCurrentCode(response.code);
        }

        // Update diamond balance if returned
        if (response.balance !== undefined) {
          updateDiamonds(response.balance);
        }

        // AUTO-SAVE: Save to database after successful refinement
        if (projectId && (response.demoUrl || response.code)) {
          explicitSave().catch((err) => {
            console.warn("[ChatPanel] Auto-save after refinement failed:", err);
          });
        }
      } else {
        // Check if error is due to credits/auth
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
        if (messages.length === 0) {
          await handleGenerate(message);
        } else {
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

      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-300">Chatt</span>
        <HelpTooltip text="Här ser du konversationen med AI:n. Varje meddelande du skickar uppdaterar din webbplats. Tänk på det som att prata med en designer!" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isLoading ? (
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

      {/* Input */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        {/* Component picker - show after first generation started */}
        {messages.length > 0 && (
          <ComponentPicker
            onSelect={(prompt) => {
              setInput(prompt);
              // Auto-submit if we have a preview to refine
              if (demoUrl || currentCode) {
                setTimeout(() => {
                  handleRefinement(prompt);
                }, 100);
              }
            }}
            disabled={isLoading}
          />
        )}

        {/* Advanced Tools Bar - show after first generation */}
        {messages.length > 0 && isAuthenticated && isProjectOwned && (
          <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/50 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-white">
                AI Media Generator
              </span>
              <HelpTooltip text="Använd OpenAI för att generera bilder, loggor och videos för din sajt." />
            </div>
            
            {/* Tool selection buttons */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={selectedAdvancedTool === "image" ? "default" : "outline"}
                className="flex items-center gap-2"
                onClick={() => {
                  setSelectedAdvancedTool("image");
                  setShowVideoGenerator(false);
                }}
                disabled={isLoading}
              >
                <ImageIcon className="h-4 w-4" />
                Bild (3 💎)
              </Button>
              <Button
                size="sm"
                variant={selectedAdvancedTool === "video" ? "default" : "outline"}
                className="flex items-center gap-2"
                onClick={() => {
                  setSelectedAdvancedTool("video");
                  setShowVideoGenerator(true);
                }}
                disabled={isLoading}
              >
                <Video className="h-4 w-4" />
                Video (10 💎)
              </Button>
            </div>
          </div>
        )}

        {/* Video Generator - show when video tool is selected */}
        {showVideoGenerator && isProjectOwned && (
          <div className="border border-gray-800 rounded-lg p-4 bg-gray-900/50">
            <VideoGenerator
              projectId={projectId || undefined}
              diamonds={diamonds}
              disabled={isLoading}
              onVideoGenerated={(url) => {
                addMessage("assistant", `Video genererad! ${url}`);
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 p-3 bg-gray-800/50 border border-gray-700/50 focus-within:border-gray-600">
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
                : "Förfina eller lägg till komponenter..."
            }
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-500 outline-none"
          />
          {/* Domain suggestions button - always available */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowDomainModal(true)}
            disabled={isLoading}
            className="h-8 w-8 p-0 text-gray-400 hover:text-teal-400 hover:bg-gray-800"
            title="Hitta domännamn (WHOIS-koll)"
          >
            <Globe className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 p-0 bg-teal-600 hover:bg-teal-500"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-600 text-center">
          {messages.length === 0
            ? "Tryck Enter för att generera"
            : "Skriv ändringar eller välj komponenter ovan"}
        </p>
      </div>

      {/* Domain Suggestions Modal */}
      <DomainSuggestions
        companyName={projectName}
        isOpen={showDomainModal}
        onClose={() => setShowDomainModal(false)}
      />
    </div>
  );
}
