"use client";

/**
 * PromptInput Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Main input field for website descriptions with:
 * - Auto-resizing textarea
 * - Keyboard shortcuts (Enter to submit, Shift+Enter for newline)
 * - AI Wizard integration for guided prompt building
 * - Example prompts for inspiration
 *
 * ACCESSIBILITY:
 * - Proper focus management
 * - Keyboard navigation
 * - ARIA labels for buttons
 */

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/layout";
import { PromptWizardModalV2, type WizardData } from "@/components/modals";
import { ArrowUp, Loader2, Wand2, Lightbulb } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

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
  const [showWizard, setShowWizard] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Update prompt when initialValue changes
  useEffect(() => {
    if (initialValue !== undefined && initialValue !== null) {
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

  const handleSubmit = async () => {
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

  // Handle wizard completion - auto-submit the expanded prompt
  const handleWizardComplete = (
    _wizardData: WizardData,
    expandedPrompt: string
  ) => {
    setShowWizard(false);

    // Auto-submit with the expanded prompt
    if (onSubmit) {
      onSubmit(expandedPrompt);
    }

    if (navigateOnSubmit) {
      router.push(`/builder?prompt=${encodeURIComponent(expandedPrompt)}`);
    }
  };

  return (
    <>
      {/* Prompt Wizard Modal V2 - Streamlined 5-step flow */}
      <PromptWizardModalV2
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        initialPrompt={prompt}
        categoryType="website"
      />

      <div className="w-full max-w-2xl space-y-4">
        <div className="relative">
          <div className="flex items-start gap-2 p-3 bg-black/50 border border-gray-800 focus-within:border-gray-700 focus-within:ring-1 focus-within:ring-gray-700 transition-all">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              className="flex-1 min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
              rows={1}
            />
            <Button
              onClick={() => setShowWizard(true)}
              disabled={isLoading}
              size="icon"
              title="Bygg ut med AI"
              className="h-9 w-9 shrink-0 bg-brand-teal hover:bg-brand-teal/90 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading}
              size="icon"
              title="Skapa webbplats"
              className="h-9 w-9 shrink-0 bg-brand-teal hover:bg-brand-teal/90 disabled:opacity-50"
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
              className="bg-black"
            />
          </div>
        </div>

        {/* Example prompts - inspiration för användare */}
        <div className="space-y-3">
          <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1.5">
            <Lightbulb className="h-3 w-3 text-brand-amber/70" />
            Prova ett exempel:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                aria-label={`Använd exempel: ${example}`}
                className="
                  text-xs px-3 py-1.5
                  bg-gray-800/50 text-gray-400
                  hover:bg-brand-teal/10 hover:text-brand-teal/80 hover:border-brand-teal/30
                  border border-transparent
                  transition-all duration-200
                  truncate max-w-[280px]
                  focus:outline-none focus:ring-2 focus:ring-brand-teal/30
                "
              >
                &quot;{example.slice(0, 40)}...&quot;
              </button>
            ))}
          </div>

          {/* Character count and hint */}
          <div className="flex justify-between items-center px-1">
            <span
              className={`text-xs transition-colors ${
                prompt.length > 500 ? "text-brand-amber" : "text-gray-500"
              }`}
            >
              {prompt.length} tecken
              {prompt.length > 500 && (
                <span className="ml-1 text-brand-amber/70">(detaljerat ✓)</span>
              )}
            </span>
            <span className="text-xs text-gray-600 hidden sm:inline">
              <Wand2 className="h-3 w-3 inline mr-1 text-brand-teal/70" />
              Teal-knappen bygger ut med AI
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
