"use client";

import Link from "next/link";
import { TemplateGallery } from "@/components/template-gallery";
import { PromptInput } from "@/components/prompt-input";
import { HelpTooltip } from "@/components/help-tooltip";
import { OnboardingModal, useOnboarding } from "@/components/onboarding-modal";
import { Rocket, FolderOpen, RotateCcw } from "lucide-react";

export function HomePage() {
  const {
    showOnboarding,
    onboardingData,
    handleComplete,
    handleSkip,
    resetOnboarding,
  } = useOnboarding();

  // Build initial prompt from onboarding data
  const getInitialContext = () => {
    if (!onboardingData) return null;

    const parts: string[] = [];

    if (onboardingData.existingUrl) {
      const purposeText = {
        improve: "Jag vill förbättra denna sida",
        audit: "Jag vill ha en audit av denna sida",
        inspiration: "Jag vill ta inspiration från denna sida",
      };
      parts.push(
        `Min befintliga webbplats: ${onboardingData.existingUrl} (${
          onboardingData.urlPurpose
            ? purposeText[onboardingData.urlPurpose]
            : ""
        })`
      );
    }

    if (onboardingData.analyzeFromWeb) {
      parts.push(
        "Analysera gärna mitt företag från internet för att förstå min verksamhet."
      );
    }

    if (onboardingData.description) {
      parts.push(onboardingData.description);
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  };

  const initialContext = getInitialContext();

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900">
      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}

      {/* Background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent pointer-events-none" />

      {/* Top navigation */}
      <nav className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-center">
        {/* Reset onboarding button (for testing) */}
        <button
          onClick={resetOnboarding}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          title="Visa introduktion igen"
        >
          <RotateCcw className="h-3 w-3" />
          Intro
        </button>

        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 hover:text-white text-sm font-medium transition-colors"
        >
          <FolderOpen className="h-4 w-4" />
          Mina Projekt
        </Link>
      </nav>

      <div className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-500/20">
              <Rocket className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              SajtMaskin
            </h1>
          </div>
          <h2 className="text-xl sm:text-2xl text-zinc-300 font-medium flex items-center justify-center gap-2">
            Vad vill du bygga idag?
            <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
          </h2>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Skapa professionella webbplatser på minuter med hjälp av AI. Välj en
            mall eller beskriv din vision.
          </p>
        </div>

        {/* Show context from onboarding if available */}
        {initialContext && (
          <div className="w-full max-w-2xl bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-emerald-400">
                ✓ Din information sparad
              </span>
              <button
                onClick={resetOnboarding}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                Ändra
              </button>
            </div>
            <p className="text-sm text-zinc-400 whitespace-pre-line line-clamp-3">
              {initialContext}
            </p>
          </div>
        )}

        {/* Template Gallery */}
        <TemplateGallery />

        {/* Divider */}
        <div className="flex items-center gap-4 w-full max-w-md">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
          <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
            Eller
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
        </div>

        {/* Prompt Input */}
        <PromptInput initialValue={initialContext || undefined} />

        {/* Footer hint */}
        <p className="text-xs text-zinc-600 text-center max-w-sm">
          Tryck Enter för att skicka, Shift+Enter för ny rad.
          <br />
          AI genererar kod som du kan ladda ner och använda.
        </p>
      </div>
    </main>
  );
}
