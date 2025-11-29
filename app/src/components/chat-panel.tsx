"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useBuilderStore } from "@/lib/store";
import {
  generateWebsite,
  refineWebsite,
  generateFromTemplate,
} from "@/lib/api-client";
import { ChatMessage } from "@/components/chat-message";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowUp, Loader2 } from "lucide-react";

interface ChatPanelProps {
  categoryType?: string;
  initialPrompt?: string;
  templateId?: string;
}

export function ChatPanel({
  categoryType,
  initialPrompt,
  templateId,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);
  // Track what we initialized with to detect changes
  const initializedWith = useRef<string | null>(null);

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
    clearChat,
  } = useBuilderStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-generate on initial load or when params change
  useEffect(() => {
    const currentKey = `${categoryType || ""}-${initialPrompt || ""}-${
      templateId || ""
    }`;

    // If we already initialized with these exact params, skip
    if (hasInitialized.current && initializedWith.current === currentKey) {
      console.log(
        "[ChatPanel] Already initialized with these params, skipping"
      );
      return;
    }

    // If already loading, don't start another request
    if (isLoading) {
      console.log("[ChatPanel] Already loading, skipping duplicate request");
      return;
    }

    // Check if params changed - if so, clear old state and regenerate
    const paramsChanged =
      hasInitialized.current && initializedWith.current !== currentKey;

    if (paramsChanged) {
      console.log("[ChatPanel] Params changed, clearing chat");
      clearChat();
    } else if (demoUrl && messages.length > 0) {
      // Only skip if we have persisted content AND params haven't changed
      console.log(
        "[ChatPanel] Already have content from persisted state, skipping"
      );
      hasInitialized.current = true;
      initializedWith.current = currentKey;
      return;
    }

    hasInitialized.current = true;
    initializedWith.current = currentKey;

    // If we have a templateId, generate from template
    if (templateId) {
      console.log("[ChatPanel] Starting template generation:", templateId);
      handleTemplateGeneration(templateId);
      return;
    }

    const initialMessage =
      initialPrompt ||
      (categoryType ? `Skapa en ${getCategoryName(categoryType)}` : null);

    if (initialMessage) {
      console.log("[ChatPanel] Starting initial generation:", {
        categoryType,
        initialPrompt,
      });
      handleGenerate(initialMessage, categoryType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categoryType,
    initialPrompt,
    templateId,
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
        console.error("[ChatPanel] Template generation failed:", response.error);
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
      <div className="p-4 border-t border-zinc-800">
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
        <p className="text-xs text-zinc-600 mt-2 text-center">
          {messages.length === 0
            ? "Tryck Enter för att generera"
            : "Skriv ändringar för att förfina designen"}
        </p>
      </div>
    </div>
  );
}
