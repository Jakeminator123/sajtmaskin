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
import {
  generateWebsite, // Generera från prompt eller kod
  refineWebsite, // Förfina existerande design
  generateFromTemplate, // Ladda v0 community template
} from "@/lib/api-client";
import { ChatMessage } from "@/components/chat-message";
import { HelpTooltip } from "@/components/help-tooltip";
import { ComponentPicker } from "@/components/component-picker";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowUp, Loader2 } from "lucide-react";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Check if we're in test mode (force regeneration, skip cache)
  const isTestMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("testMode") === "true";

  // Auto-generate on initial load or when params change
  useEffect(() => {
    const currentKey = `${categoryType || ""}-${initialPrompt || ""}-${
      templateId || ""
    }-${localTemplateId || ""}`;

    // Skip if already loading
    if (isLoading) return;

    // Check if this is a new request (different from last generated)
    const isNewRequest = lastGeneratedKey.current !== currentKey;

    // In test mode, always clear and regenerate
    if (isTestMode && (messages.length > 0 || demoUrl)) {
      clearChat();
      lastGeneratedKey.current = null;
      return;
    }

    // If we have content but it's from a DIFFERENT request, clear it first
    if (isNewRequest && (messages.length > 0 || demoUrl)) {
      clearChat();
      lastGeneratedKey.current = null;
      return; // Wait for state to clear, effect will re-run
    }

    // Skip if already generated this exact request
    if (lastGeneratedKey.current === currentKey && !isTestMode) {
      return;
    }

    // Ready to generate - mark this key as being generated
    lastGeneratedKey.current = currentKey;

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
    messages.length,
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

      let v0Response;

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

        v0Response = await generateWebsite(templatePrompt, undefined, quality);
      }

      if (v0Response.success) {
        // Save the v0 response to state
        if (v0Response.chatId) setChatId(v0Response.chatId);
        if (v0Response.demoUrl) setDemoUrl(v0Response.demoUrl);
        if (v0Response.files && v0Response.files.length > 0) {
          setFiles(v0Response.files);
        }
        if (v0Response.code) {
          setCurrentCode(v0Response.code);
        }
        if (v0Response.versionId) {
          setVersionId(v0Response.versionId);
        }

        addMessage(
          "assistant",
          `Mallen är redo! Du kan nu se preview och fortsätta anpassa den genom att skriva ändringar nedan.`
        );
      } else {
        // Fallback: show code-only mode
        console.warn("[ChatPanel] v0 generation failed:", v0Response.error);
        addMessage(
          "assistant",
          `Mallen laddades men live preview kunde inte genereras. Klicka på "Kod" för att se koden, eller försök skriva en prompt för att generera en ny version.`
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
      console.log("[ChatPanel] Calling template API...");
      const response = await generateFromTemplate(templateId, quality);
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
          console.log("[ChatPanel] Saving chatId:", response.chatId);
          setChatId(response.chatId);
        }

        // Save files from v0-sdk response
        if (response.files && response.files.length > 0) {
          console.log(
            "[ChatPanel] Saving files, count:",
            response.files.length
          );
          setFiles(response.files);
        }

        // Save demo URL
        if (response.demoUrl) {
          console.log("[ChatPanel] Saving demoUrl:", response.demoUrl);
          setDemoUrl(response.demoUrl);
        }

        // Set the main code
        if (response.code) {
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
    console.log("[ChatPanel] handleGenerate called:", {
      prompt,
      type,
      quality,
    });
    addMessage("user", prompt);
    setLoading(true);

    try {
      console.log("[ChatPanel] Calling API...");
      const response = await generateWebsite(prompt, type, quality);
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
          console.log("[ChatPanel] Saving chatId:", response.chatId);
          setChatId(response.chatId);
        }

        // Save demoUrl for iframe preview (v0's hosted preview)
        if (response.demoUrl) {
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
          console.log(
            "[ChatPanel] Saving files, count:",
            response.files.length
          );
          setFiles(response.files);
        }

        // Set the main code
        if (response.code) {
          console.log(
            "[ChatPanel] Setting code, length:",
            response.code.length
          );
          setCurrentCode(response.code);
        } else {
          console.warn(
            "[ChatPanel] Response was successful but no code received"
          );
        }
      } else {
        const errorMsg = response.error || "Något gick fel. Försök igen.";
        console.error("[ChatPanel] Generation failed:", errorMsg);
        addMessage("assistant", errorMsg);
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

    try {
      console.log("[ChatPanel] Refining with chatId:", chatId);
      // Pass chatId to continue the conversation with v0
      const response = await refineWebsite(
        currentCode,
        instruction,
        quality,
        chatId || undefined
      );

      if (response.success && response.message) {
        addMessage("assistant", response.message);

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
      } else {
        addMessage(
          "assistant",
          response.error || "Något gick fel. Försök igen."
        );
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
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-medium text-zinc-300">Chatt</span>
        <HelpTooltip text="Här ser du konversationen med AI:n. Varje meddelande du skickar uppdaterar din webbplats. Tänk på det som att prata med en designer!" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-zinc-800/50 mb-4">
                <MessageSquare className="h-8 w-8 text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-500 max-w-[200px]">
                {categoryType
                  ? `Genererar din ${getCategoryName(categoryType)}...`
                  : "Skriv något för att börja!"}
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-3 p-4 bg-zinc-800/50 rounded-lg mr-8">
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 text-zinc-300 animate-spin" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-zinc-500">
                      AI:n genererar...
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800 space-y-3">
        {/* Component picker - only show when we have content */}
        {demoUrl && (
          <ComponentPicker
            onSelect={(prompt) => {
              setInput(prompt);
              // Auto-submit the component request
              setTimeout(() => {
                handleRefinement(prompt);
              }, 100);
            }}
            disabled={isLoading}
          />
        )}

        <div className="flex items-center gap-2 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 focus-within:border-zinc-600">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              messages.length === 0
                ? "Beskriv din webbplats..."
                : "Förfina din webbplats..."
            }
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-500"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-zinc-600 text-center">
          {messages.length === 0
            ? "Tryck Enter för att generera"
            : "Skriv ändringar för att förfina designen"}
        </p>
      </div>
    </div>
  );
}
