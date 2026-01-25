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
 * - Pre-builder settings (model tier + prompt assist)
 *
 * ACCESSIBILITY:
 * - Proper focus management
 * - Keyboard navigation
 * - ARIA labels for buttons
 */

import { useState, useRef, useEffect, useId, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/layout";
import { PromptWizardModalV2, type WizardData } from "@/components/modals";
import {
  PreBuilderSettings,
  getDefaultPreBuilderSettings,
  buildSettingsUrlParams,
} from "@/components/forms/pre-builder-settings";
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
  const [settings, setSettings] = useState(getDefaultPreBuilderSettings);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const promptInputId = useId();

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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  const handleSubmit = async () => {
    if (!prompt.trim() || isLoading) return;

    if (onSubmit) {
      onSubmit(prompt);
    }

    if (navigateOnSubmit) {
      const settingsParams = buildSettingsUrlParams(settings);
      router.push(`/builder?prompt=${encodeURIComponent(prompt)}&${settingsParams}`);
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
  const handleWizardComplete = (_wizardData: WizardData, expandedPrompt: string) => {
    setShowWizard(false);

    // Auto-submit with the expanded prompt
    if (onSubmit) {
      onSubmit(expandedPrompt);
    }

    if (navigateOnSubmit) {
      const settingsParams = buildSettingsUrlParams(settings);
      router.push(`/builder?prompt=${encodeURIComponent(expandedPrompt)}&${settingsParams}`);
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
          <div className="flex items-start gap-2 border border-gray-800 bg-black/50 p-3 transition-all focus-within:border-gray-700 focus-within:ring-1 focus-within:ring-gray-700">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isLoading}
              id={`home-prompt-${promptInputId}`}
              name="homePrompt"
              aria-label="Beskriv din webbplats"
              className="max-h-[200px] min-h-[44px] flex-1 resize-none border-0 bg-transparent p-0 text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
            <PreBuilderSettings
              value={settings}
              onChange={setSettings}
              disabled={isLoading}
              compact
            />
            <Button
              onClick={() => setShowWizard(true)}
              disabled={isLoading}
              size="icon"
              title="Bygg ut med AI"
              className="bg-brand-teal hover:bg-brand-teal/90 h-9 w-9 shrink-0 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading}
              size="icon"
              title="Skapa webbplats"
              className="bg-brand-teal hover:bg-brand-teal/90 h-9 w-9 shrink-0 disabled:opacity-50"
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
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-500">
            <Lightbulb className="text-brand-amber/70 h-3 w-3" />
            Prova ett exempel:
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                aria-label={`Använd exempel: ${example}`}
                className="hover:bg-brand-teal/10 hover:text-brand-teal/80 hover:border-brand-teal/30 focus:ring-brand-teal/30 max-w-[280px] truncate border border-transparent bg-gray-800/50 px-3 py-1.5 text-xs text-gray-400 transition-all duration-200 focus:ring-2 focus:outline-none"
              >
                &quot;{example.slice(0, 40)}...&quot;
              </button>
            ))}
          </div>

          {/* Character count and hint */}
          <div className="flex items-center justify-between px-1">
            <span
              className={`text-xs transition-colors ${
                prompt.length > 500 ? "text-brand-amber" : "text-gray-500"
              }`}
            >
              {prompt.length} tecken
              {prompt.length > 500 && (
                <span className="text-brand-amber/70 ml-1">(detaljerat ✓)</span>
              )}
            </span>
            <span className="hidden text-xs text-gray-600 sm:inline">
              <Wand2 className="text-brand-teal/70 mr-1 inline h-3 w-3" />
              Teal-knappen bygger ut med AI
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
