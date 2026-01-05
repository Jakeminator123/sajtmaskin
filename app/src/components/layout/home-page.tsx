"use client";

/**
 * HomePage Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Main landing page for SajtMaskin with:
 *
 * SECTIONS:
 * 1. Hero with personalized greeting (for logged-in users)
 * 2. Template Gallery - Quick start with preset categories
 * 3. Site Audit - Analyze existing websites
 * 4. Prompt Input - Custom website description
 *
 * FEATURES:
 * - Shader background with theme variations
 * - Onboarding flow for new users
 * - Responsive design (mobile-first)
 *
 * STATE MANAGEMENT:
 * - Auth state via useAuth hook
 * - Onboarding via custom hook
 */

import { useState, useRef } from "react";
import { TemplateGallery } from "@/components/templates";
import { PromptInput } from "@/components/forms";
import { OnboardingModal, useOnboarding, AuditModal } from "@/components/modals";
import { AuthModal } from "@/components/auth";
import { UserSettingsModal } from "@/components/settings/user-settings-modal";
import { HelpTooltip, Navbar, ShaderBackground, SiteAuditSection } from "./index";
import { RotateCcw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import type { AuditResult } from "@/types/audit";

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditedUrl, setAuditedUrl] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditGeneratedPrompt, setAuditGeneratedPrompt] = useState<
    string | null
  >(null);
  const promptInputRef = useRef<HTMLDivElement>(null);

  // Get user state for personalized experience
  const { user, isAuthenticated } = useAuth();

  const {
    showOnboarding,
    onboardingData,
    handleComplete,
    handleSkip,
    resetOnboarding,
  } = useOnboarding();

  // Get user's first name for greeting
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || undefined;

  const handleLoginClick = () => {
    setAuthMode("login");
    setShowAuthModal(true);
  };

  const handleRegisterClick = () => {
    setAuthMode("register");
    setShowAuthModal(true);
  };

  const handleAuditComplete = (result: AuditResult, url: string) => {
    setAuditResult(result);
    setAuditedUrl(url);
    setShowAuditModal(true);
  };

  const handleRequireAuth = () => {
    setAuthMode("login");
    setShowAuthModal(true);
  };

  // Handle "Build site from audit" - scroll to prompt input with pre-filled prompt
  const handleBuildFromAudit = (prompt: string) => {
    setAuditGeneratedPrompt(prompt);
    setShowAuditModal(false);

    // Scroll to prompt input section
    setTimeout(() => {
      promptInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
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
      {/* Shader Background - shimmer effect for logged in users */}
      <ShaderBackground
        theme={isAuthenticated ? "aurora" : "default"}
        speed={0.2}
        opacity={isAuthenticated ? 0.45 : 0.35}
        shimmer={isAuthenticated}
        shimmerSpeed={10}
      />

      {/* Navbar */}
      <Navbar
        onLoginClick={handleLoginClick}
        onRegisterClick={handleRegisterClick}
        onSettingsClick={() => setShowSettingsModal(true)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      {/* Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* Audit Result Modal */}
      <AuditModal
        result={auditResult}
        auditedUrl={auditedUrl}
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        onBuildFromAudit={handleBuildFromAudit}
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
        {/* Personalized greeting for logged-in users */}
        {isAuthenticated && firstName && firstName !== undefined && (
          <div className="text-center animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 border border-purple-500/20 rounded-full mb-4">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-gray-300">
                Välkommen tillbaka,{" "}
                <span className="text-white font-medium">{firstName}</span>!
              </span>
              <span className="text-xs text-gray-500">{user?.diamonds ?? 0} 💎</span>
            </div>
          </div>
        )}

        {/* Header - Main heading with animated entrance */}
        <div className="text-center space-y-4 animate-fadeInUp">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">
            {isAuthenticated
              ? "Vad vill du skapa idag?"
              : "Vad vill du bygga idag?"}
          </h1>
          <p className="text-gray-400 max-w-md mx-auto flex items-center justify-center gap-2 text-sm sm:text-base">
            {isAuthenticated
              ? "Dina projekt och analyser sparas automatiskt i ditt konto."
              : "Skapa professionella webbplatser på minuter med hjälp av AI."}
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

        {/* ═══════════════════════════════════════════════════════════
            SECTION: Site Audit
            Allows users to analyze their existing websites
            ═══════════════════════════════════════════════════════════ */}
        
        {/* Divider - Site Audit */}
        <div className="flex items-center gap-4 w-full max-w-2xl animate-fadeIn stagger-4 opacity-0 [animation-fill-mode:forwards]">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-700/50 to-transparent" />
          <span className="text-sm font-medium text-teal-500/70 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
            Analysera
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-700/50 to-transparent" />
        </div>

        {/* Site Audit Section */}
        <SiteAuditSection
          onAuditComplete={handleAuditComplete}
          onRequireAuth={handleRequireAuth}
        />

        {/* ═══════════════════════════════════════════════════════════
            SECTION: Custom Prompt
            Free-form text input for custom website descriptions
            ═══════════════════════════════════════════════════════════ */}
        
        {/* Divider - Custom Build */}
        <div className="flex items-center gap-4 w-full max-w-md animate-fadeIn stagger-5 opacity-0 [animation-fill-mode:forwards]">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            Eller beskriv
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
        </div>

        {/* Prompt Input */}
        <div ref={promptInputRef} className="animate-fadeInUp stagger-6 opacity-0 [animation-fill-mode:forwards]">
          <PromptInput
            initialValue={auditGeneratedPrompt || initialContext || undefined}
            key={auditGeneratedPrompt || "default"} // Force re-render when prompt changes
          />
        </div>

        {/* Footer hint - keyboard shortcuts */}
        <p className="text-xs text-gray-600 text-center max-w-sm animate-fadeIn" style={{ animationDelay: '0.4s' }}>
          <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded">Enter</kbd> för att skicka • 
          <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded ml-1">Shift+Enter</kbd> för ny rad
          <br />
          <span className="text-gray-500 mt-1 inline-block">
            AI genererar kod som du kan ladda ner och använda.
          </span>
        </p>
      </div>

    </main>
  );
}
