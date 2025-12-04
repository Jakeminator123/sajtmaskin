"use client";

import { useState } from "react";
import { TemplateGallery } from "@/components/template-gallery";
import { PromptInput } from "@/components/prompt-input";
import { HelpTooltip } from "@/components/help-tooltip";
import { OnboardingModal, useOnboarding } from "@/components/onboarding-modal";
import { Navbar } from "@/components/navbar";
import { AuthModal } from "@/components/auth/auth-modal";
import { ShaderBackground } from "@/components/shader-background";
import { RotateCcw } from "lucide-react";

export function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const {
    showOnboarding,
    onboardingData,
    handleComplete,
    handleSkip,
    resetOnboarding,
  } = useOnboarding();

  const handleLoginClick = () => {
    setAuthMode("login");
    setShowAuthModal(true);
  };

  const handleRegisterClick = () => {
    setAuthMode("register");
    setShowAuthModal(true);
  };

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
    <main className="min-h-screen bg-black">
      {/* Shader Background - subtle and subdued */}
      <ShaderBackground color="#002020" speed={0.2} opacity={0.35} />

      {/* Navbar */}
      <Navbar
        onLoginClick={handleLoginClick}
        onRegisterClick={handleRegisterClick}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}

      {/* Reset onboarding button (dev/testing only) */}
      <button
        onClick={resetOnboarding}
        className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 px-3 py-1.5 bg-black/70 hover:bg-black/90 text-gray-500 hover:text-gray-300 text-xs transition-colors border border-gray-700"
        title="Visa introduktion igen"
      >
        <RotateCcw className="h-3 w-3" />
        Intro
      </button>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 pt-24 pb-16 space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Vad vill du bygga idag?
          </h1>
          <p className="text-gray-400 max-w-md mx-auto flex items-center justify-center gap-2 text-sm">
            Skapa professionella webbplatser på minuter med hjälp av AI.
            <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
          </p>
        </div>

        {/* Show context from onboarding if available */}
        {initialContext && (
          <div className="w-full max-w-2xl bg-black/70 border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-teal-400">
                ✓ Din information sparad
              </span>
              <button
                onClick={resetOnboarding}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Ändra
              </button>
            </div>
            <p className="text-sm text-gray-400 whitespace-pre-line line-clamp-3">
              {initialContext}
            </p>
          </div>
        )}

        {/* Template Gallery */}
        <TemplateGallery />

        {/* Divider */}
        <div className="flex items-center gap-4 w-full max-w-md">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Eller
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
        </div>

        {/* Prompt Input */}
        <PromptInput initialValue={initialContext || undefined} />

        {/* Footer hint */}
        <p className="text-xs text-gray-600 text-center max-w-sm">
          Tryck Enter för att skicka, Shift+Enter för ny rad.
          <br />
          AI genererar kod som du kan ladda ner och använda.
        </p>
      </div>
    </main>
  );
}
