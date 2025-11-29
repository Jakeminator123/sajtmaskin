"use client";

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { useBuilderStore } from "@/lib/store";
import {
  generateMockResponse,
  generateMockRefinement,
} from "@/lib/mock-generator";
import { ChatMessage } from "@/components/chat-message";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowUp, Loader2 } from "lucide-react";

interface ChatPanelProps {
  categoryType?: string;
  initialPrompt?: string;
}

export function ChatPanel({ categoryType, initialPrompt }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);

  const { messages, isLoading, addMessage, setLoading, setCurrentCode } =
    useBuilderStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-generate on initial load
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initialMessage =
      initialPrompt ||
      (categoryType ? `Skapa en ${getCategoryName(categoryType)}` : null);

    if (initialMessage) {
      handleGenerate(initialMessage, categoryType);
    }
  }, [categoryType, initialPrompt]);

  const getCategoryName = (type: string): string => {
    const names: Record<string, string> = {
      "landing-page": "landing page",
      website: "hemsida",
      dashboard: "dashboard",
      ecommerce: "webbshop",
      blog: "blogg",
      portfolio: "portfolio",
      webapp: "web app",
    };
    return names[type] || type;
  };

  const handleGenerate = async (prompt: string, type?: string) => {
    addMessage("user", prompt);
    setLoading(true);

    try {
      const response = await generateMockResponse(prompt, type);
      addMessage("assistant", response.message);
      setCurrentCode(response.code);
    } catch (error) {
      addMessage("assistant", "Något gick fel. Försök igen.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefinement = async (instruction: string) => {
    addMessage("user", instruction);
    setLoading(true);

    try {
      const response = await generateMockRefinement(instruction);
      addMessage("assistant", response.message);
      // In real implementation, this would update the code
    } catch (error) {
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
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
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
