"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/help-tooltip";
import { ArrowUp, Loader2 } from "lucide-react";

interface PromptInputProps {
  onSubmit?: (prompt: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  navigateOnSubmit?: boolean;
  initialValue?: string;
}

const examplePrompts = [
  "En modern SaaS-landningssida för ett projekthanteringsverktyg med mörkt tema",
  "En portfolio för en fotograf med bildgalleri och kontaktformulär",
  "En dashboard för att visa försäljningsstatistik med diagram och tabeller",
];

export function PromptInput({
  onSubmit,
  isLoading = false,
  placeholder = "Beskriv din webbplats med egna ord...",
  navigateOnSubmit = true,
  initialValue,
}: PromptInputProps) {
  const [prompt, setPrompt] = useState(initialValue || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Update prompt when initialValue changes
  useEffect(() => {
    if (initialValue) {
      setPrompt(initialValue);
    }
  }, [initialValue]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [prompt]);

  const handleSubmit = () => {
    if (!prompt.trim() || isLoading) return;

    if (onSubmit) {
      onSubmit(prompt);
    }

    if (navigateOnSubmit) {
      router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to submit, Shift+Enter for new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    textareaRef.current?.focus();
  };

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="relative">
        <div className="flex items-start gap-2 p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
            rows={1}
          />
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading}
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="absolute -top-2 right-3">
          <HelpTooltip
            text="Beskriv din drömwebbplats här. Ju mer detaljer du ger, desto bättre blir resultatet. Exempel: 'En modern SaaS-landningssida för ett projekthanteringsverktyg med mörkt tema och blåa accenter'"
            className="bg-zinc-900"
          />
        </div>
      </div>

      {/* Example prompts */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 text-center">Prova ett exempel:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {examplePrompts.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              className="text-xs px-3 py-1.5 rounded-full bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors truncate max-w-[280px]"
            >
              &quot;{example.slice(0, 40)}...&quot;
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
