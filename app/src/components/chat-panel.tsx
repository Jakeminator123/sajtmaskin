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

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useBuilderStore } from "@/lib/store";
import { useAuth } from "@/lib/auth-store";
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
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowUp, Loader2, Sparkles, Globe } from "lucide-react";

// Debug flag - set to true for verbose logging
const DEBUG = false;

interface ChatPanelProps {
  categoryType?: string;
  initialPrompt?: string;
  templateId?: string;
  localTemplateId?: string;
}

export function ChatPanel({
  categoryType,
  initialPrompt,
  templateId,
  localTemplateId,
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

  const { updateDiamonds, fetchUser } = useAuth();

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
  } = useBuilderStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Track the last generated key to detect changes
  const lastGeneratedKey = useRef<string | null>(null);
  // Track if generation has started (prevents double-execution)
  const generationStarted = useRef(false);

  // Check if we're in test mode (force regeneration, skip cache)
  const isTestMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("testMode") === "true";

  // Auto-generate on initial load or when params change
  useEffect(() => {
    const currentKey = `${categoryType || ""}-${initialPrompt || ""}-${
      templateId || ""
    }-${localTemplateId || ""}`;

    // Skip if already loading or generation already started for this key
    if (isLoading || generationStarted.current) return;

    // Check if this is a new request (different from last generated)
    const isNewRequest = lastGeneratedKey.current !== currentKey;

    // In test mode, always clear and regenerate
    if (isTestMode && (messages.length > 0 || demoUrl)) {
      clearChat();
      lastGeneratedKey.current = null;
      generationStarted.current = false;
      return;
    }

    // If we have content but it's from a DIFFERENT request, clear it first
    if (isNewRequest && (messages.length > 0 || demoUrl)) {
      clearChat();
      lastGeneratedKey.current = null;
      generationStarted.current = false;
      return; // Wait for state to clear, effect will re-run
    }

    // Skip if already generated this exact request
    if (lastGeneratedKey.current === currentKey && !isTestMode) {
      return;
    }

    // Ready to generate - mark this key as being generated
    lastGeneratedKey.current = currentKey;
    generationStarted.current = true; // Prevent double-execution

    // Handle different generation modes
    if (localTemplateId) {
      handleLocalTemplateLoad(localTemplateId);
      return;
    }

    if (templateId) {
      handleTemplateGeneration(templateId);
      return;
    }

    // Use the prompt (either from URL or generate default based on category)
    const initialMessage =
      initialPrompt ||
      (categoryType ? `Skapa en ${getCategoryName(categoryType)}` : null);

    if (initialMessage) {
      handleGenerate(initialMessage, categoryType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categoryType,
    initialPrompt,
    templateId,
    localTemplateId,
    isLoading,
    demoUrl,
    // Note: messages.length removed to prevent double-execution when addMessage is called
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
        if (DEBUG)
          console.log(
            "[ChatPanel] Template uses v0 API directly:",
            data.template.v0TemplateId
          );
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
        }
      } // Close else block

      // Handle v0 response (for both direct API and local-to-v0 flow)
      if (v0Response?.success) {
        // Save the v0 response to state
        if (v0Response.chatId) setChatId(v0Response.chatId);
        if (v0Response.demoUrl) setDemoUrl(v0Response.demoUrl);
        if (v0Response.files && v0Response.files.length > 0) {
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
      } else {
        // Fallback: v0 API failed
        if (DEBUG)
          console.warn("[ChatPanel] v0 generation failed:", v0Response?.error);

        // For TYP A templates (v0TemplateId only, no local files), provide fallback code
        // so the code view isn't empty
        if (data.useV0Api && !currentCode) {
          const fallbackCode = `// Mall: ${data.template?.name || templateId}
// 
// ⚠️ Kunde inte ladda mallen från v0 API.
// 
// Möjliga orsaker:
// - v0 API är tillfälligt otillgänglig
// - Template-ID kan vara felaktigt
// - Nätverksfel
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
          `Mallen kunde inte laddas från v0 API. Du kan prova att ladda om sidan eller skriva en egen prompt för att generera innehåll.`
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
      if (DEBUG) console.log("[ChatPanel] Calling template API...");
      const response = await generateFromTemplate(templateId, quality);
      if (DEBUG)
        console.log("[ChatPanel] Template API response:", {
          success: response.success,
          hasCode: !!response.code,
          hasFiles: !!response.files?.length,
          hasChatId: !!response.chatId,
          hasDemoUrl: !!response.demoUrl,
        });

      if (response.success) {
        // Save chatId for subsequent refinements
        if (response.chatId) {
          if (DEBUG) console.log("[ChatPanel] Saving chatId:", response.chatId);
          setChatId(response.chatId);
        }

        // Save files from v0-sdk response
        if (response.files && response.files.length > 0) {
          if (DEBUG)
            console.log(
              "[ChatPanel] Saving files, count:",
              response.files.length
            );
          setFiles(response.files);
        }

        // Save demo URL
        if (response.demoUrl) {
          if (DEBUG)
            console.log("[ChatPanel] Saving demoUrl:", response.demoUrl);
          setDemoUrl(response.demoUrl);
        }

        // Set the main code
        if (response.code) {
          if (DEBUG)
            console.log(
              "[ChatPanel] Setting code, length:",
              response.code.length
            );
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
    if (DEBUG)
      console.log("[ChatPanel] handleGenerate called:", {
        prompt,
        type,
        quality,
      });
    addMessage("user", prompt);
    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(prompt.length);
    setIsRefinementMode(false);

    try {
      if (DEBUG) console.log("[ChatPanel] Calling API...");
      const response = await generateWebsite(prompt, type, quality);
      if (DEBUG)
        console.log("[ChatPanel] API response:", {
          success: response.success,
          hasCode: !!response.code,
          hasFiles: !!response.files?.length,
          hasChatId: !!response.chatId,
          hasMessage: !!response.message,
          error: response.error,
        });

      if (response.success && response.message) {
        addMessage("assistant", response.message);

        // Save chatId for future refinements
        if (response.chatId) {
          if (DEBUG) console.log("[ChatPanel] Saving chatId:", response.chatId);
          setChatId(response.chatId);
        }

        // Save demoUrl for iframe preview (v0's hosted preview)
        if (response.demoUrl) {
          if (DEBUG)
            console.log("[ChatPanel] Saving demoUrl:", response.demoUrl);
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
          if (DEBUG)
            console.log(
              "[ChatPanel] Saving files, count:",
              response.files.length
            );
          setFiles(response.files);
        }

        // Set the main code
        if (response.code) {
          if (DEBUG)
            console.log(
              "[ChatPanel] Setting code, length:",
              response.code.length
            );
          setCurrentCode(response.code);
        } else {
          if (DEBUG)
            console.warn(
              "[ChatPanel] Response was successful but no code received"
            );
        }

        // Update diamond balance if returned
        if (response.balance !== undefined) {
          updateDiamonds(response.balance);
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
    if (!currentCode) {
      addMessage("user", instruction);
      addMessage(
        "assistant",
        "Ingen kod finns ännu att förfina. Genererar en ny design baserat på din beskrivning..."
      );
      // Treat as new generation instead
      handleGenerate(instruction);
      return;
    }

    addMessage("user", instruction);
    setLoading(true);
    setGenerationStartTime(Date.now());
    setCurrentPromptLength(instruction.length);
    setIsRefinementMode(true);

    try {
      if (DEBUG) console.log("[ChatPanel] Refining with chatId:", chatId);
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
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput("");

    if (messages.length === 0) {
      handleGenerate(message);
    } else {
      handleRefinement(message);
    }
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

        <div className="flex items-center gap-2 p-3 bg-gray-800/50 border border-gray-700/50 focus-within:border-gray-600">
          <input
            ref={inputRef}
            id="chat-message-input"
            name="chat-message"
            type="text"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
