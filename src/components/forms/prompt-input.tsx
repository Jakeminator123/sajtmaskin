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
  const [isValidating, setIsValidating] = useState(false);
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
    if (!prompt.trim() || isLoading || isValidating) return;

    // PRE-VALIDATION: Check intent FÖRE navigation
    // This prevents broken previews when prompt needs clarification
    setIsValidating(true);

    let shouldProceed = true;
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 8000; // 8 seconds - Semantic Router kan ta 3-5s

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            validateOnly: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();

          // If clarify intent, show wizard instead of navigating
          if (data.intent === "clarify") {
            setIsValidating(false);
            setShowWizard(true);
            return; // Exit early, don't navigate
          }

          // If OK, proceed with navigation
          shouldProceed = true;
          break; // Success, exit retry loop
        } else {
          // HTTP error - try again if retries left
          if (attempt < MAX_RETRIES) {
            console.warn(
              `[PromptInput] Pre-validation failed (attempt ${attempt + 1}/${
                MAX_RETRIES + 1
              }), retrying...`
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 500 * (attempt + 1))
            ); // Exponential backoff
            continue;
          } else {
            console.error(
              "[PromptInput] Pre-validation failed after retries, proceeding anyway"
            );
            shouldProceed = true; // Fail-open: proceed anyway
            break;
          }
        }
      } catch (error) {
        const isTimeout =
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("aborted"));
        const isNetworkError =
          error instanceof Error &&
          (error.message.includes("Failed to fetch") ||
            error.message.includes("NetworkError"));

        if (isTimeout) {
          console.warn(
            `[PromptInput] Pre-validation timeout (attempt ${attempt + 1}/${
              MAX_RETRIES + 1
            })`
          );
        } else if (isNetworkError) {
          console.warn(
            `[PromptInput] Pre-validation network error (attempt ${
              attempt + 1
            }/${MAX_RETRIES + 1})`
          );
        } else {
          console.error("[PromptInput] Pre-validation error:", error);
        }

        // Retry on timeout/network errors if retries left
        if ((isTimeout || isNetworkError) && attempt < MAX_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1))
          ); // Exponential backoff
          continue;
        } else {
          // Fail-open: proceed anyway after all retries or non-retryable error
          console.warn(
            "[PromptInput] Pre-validation failed, proceeding anyway (fail-open)"
          );
          shouldProceed = true;
          break;
        }
      }
    }

    setIsValidating(false);

    // If OK or validation failed, proceed with normal flow
    if (shouldProceed) {
      if (onSubmit) {
        onSubmit(prompt);
      }

      if (navigateOnSubmit) {
        router.push(`/builder?prompt=${encodeURIComponent(prompt)}`);
      }
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
              className="h-9 w-9 shrink-0 bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isLoading || isValidating}
              size="icon"
              title="Skapa webbplats"
              className="h-9 w-9 shrink-0 bg-teal-600 hover:bg-teal-500 disabled:opacity-50"
            >
              {isLoading || isValidating ? (
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
            <Lightbulb className="h-3 w-3 text-amber-500/70" />
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
                  hover:bg-teal-500/10 hover:text-teal-300 hover:border-teal-500/30
                  border border-transparent
                  transition-all duration-200 
                  truncate max-w-[280px]
                  focus:outline-none focus:ring-2 focus:ring-teal-500/30
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
                prompt.length > 500 ? "text-amber-400" : "text-gray-500"
              }`}
            >
              {prompt.length} tecken
              {prompt.length > 500 && (
                <span className="ml-1 text-amber-400/70">(detaljerat ✓)</span>
              )}
            </span>
            <span className="text-xs text-gray-600 hidden sm:inline">
              <Wand2 className="h-3 w-3 inline mr-1 text-teal-500/70" />
              Teal-knappen bygger ut med AI
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
