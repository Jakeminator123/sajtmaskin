"use client";

/**
 * HomePage Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Main landing page for SajtMaskin with:
 *
 * SECTIONS:
 * 1. Hero with personalized greeting (for logged-in users)
 * 2. Build Method Selection - Choose how to start
 *    - Analyserad: AI wizard asks questions (5 steps)
 *    - Category: Browse by type (landing page, dashboard, etc.)
 *    - Audit: Analyze existing site and improve
 *    - Freeform: Describe what you want
 *
 * FEATURES:
 * - Shader background with theme variations
 * - Onboarding flow for new users
 * - Responsive design (mobile-first)
 * - Clear separation between build methods
 *
 * STATE MANAGEMENT:
 * - Auth state via useAuth hook
 * - Onboarding via custom hook
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TemplateGallery } from "@/components/templates";
import { PromptInput } from "@/components/forms";
import {
  OnboardingModal,
  useOnboarding,
  AuditModal,
  PromptWizardModalV2,
  type WizardData,
} from "@/components/modals";
import { AuthModal } from "@/components/auth";
import { UserSettingsModal } from "@/components/settings/user-settings-modal";
import {
  HelpTooltip,
  Navbar,
  ShaderBackground,
  SiteAuditSection,
} from "./index";
import {
  RotateCcw,
  Sparkles,
  FolderOpen,
  Search,
  Pencil,
  ChevronDown,
  ChevronUp,
  Wand2,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-store";
import type { AuditResult } from "@/types/audit";

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

// Build method types for clear user selection
type BuildMethod = "category" | "audit" | "freeform" | null;

export function HomePage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditedUrl, setAuditedUrl] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [activeBuildMethod, setActiveBuildMethod] = useState<BuildMethod>(null);
  // Note: auditGeneratedPrompt removed - audit now navigates directly to builder
  // with prompt stored in sessionStorage (avoids URL length limits)

  // Get user state for personalized experience
  // IMPORTANT: Use isInitialized to prevent hydration mismatch
  const { user, isAuthenticated, isInitialized } = useAuth();

  const {
    showOnboarding,
    onboardingData,
    handleComplete,
    handleSkip,
    resetOnboarding,
  } = useOnboarding();

  // Get user's first name for greeting
  const firstName =
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || undefined;

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

  // Handle "Build site from audit" - navigate directly to builder
  // Uses sessionStorage for long prompts to avoid URL length limits
  const handleBuildFromAudit = (prompt: string) => {
    setShowAuditModal(false);

    // Store the audit prompt in storage (URL-length safe) with a unique id
    // so hard reloads don't lose the prompt during the audit→builder handoff.
    if (typeof window !== "undefined") {
      const auditId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      sessionStorage.setItem(`sajtmaskin_audit_prompt:${auditId}`, prompt);
      localStorage.setItem(`sajtmaskin_audit_prompt:${auditId}`, prompt);
      sessionStorage.setItem("sajtmaskin_audit_prompt_id", auditId);
    }

    // Navigate directly to builder with a flag indicating audit source
    // The actual prompt is in sessionStorage to avoid URL length issues
    const auditId = sessionStorage.getItem("sajtmaskin_audit_prompt_id");
    window.location.href = auditId
      ? `/builder?source=audit&auditId=${encodeURIComponent(auditId)}`
      : "/builder?source=audit";
  };

  // Handle wizard completion - navigate to builder with expanded prompt
  const handleWizardComplete = (
    _wizardData: WizardData,
    expandedPrompt: string
  ) => {
    setShowWizard(false);
    router.push(`/builder?prompt=${encodeURIComponent(expandedPrompt)}`);
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
      {/* Use default theme until auth is initialized to prevent hydration mismatch */}
      <ShaderBackground
        theme={isInitialized && isAuthenticated ? "aurora" : "default"}
        speed={0.2}
        opacity={isInitialized && isAuthenticated ? 0.45 : 0.35}
        shimmer={isInitialized && isAuthenticated}
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

      {/* Wizard Modal - AI-guided prompt building (5 steps) */}
      <PromptWizardModalV2
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        initialPrompt=""
        categoryType="website"
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
        {/* Only render after auth is initialized to prevent hydration mismatch */}
        {isInitialized && isAuthenticated && firstName && (
          <div className="text-center animate-fadeIn">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 border border-purple-500/20 rounded-full mb-4">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-gray-300">
                Välkommen tillbaka,{" "}
                <span className="text-white font-medium">{firstName}</span>!
              </span>
              <span className="text-xs text-gray-500">
                {user?.diamonds ?? 0} 💎
              </span>
            </div>
          </div>
        )}

        {/* Header - Main heading with animated entrance */}
        {/* Use default text until auth is initialized to prevent hydration mismatch */}
        <div className="text-center space-y-4 animate-fadeInUp">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight">
            {isInitialized && isAuthenticated
              ? "Vad vill du skapa idag?"
              : "Vad vill du bygga idag?"}
          </h1>
          <p className="text-gray-400 max-w-md mx-auto flex items-center justify-center gap-2 text-sm sm:text-base">
            {isInitialized && isAuthenticated
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

        {/* ═══════════════════════════════════════════════════════════
            BUILD METHOD SELECTION
            Clear options for how to start building
            ═══════════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl animate-fadeInUp stagger-2 [animation-fill-mode:forwards]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {/* Analyzed Option - Opens AI wizard directly */}
            <button
              onClick={() => setShowWizard(true)}
              className="group relative flex flex-col items-center p-5 rounded-xl border transition-all duration-300 bg-black/50 border-gray-800 hover:border-violet-500/40 hover:bg-violet-950/20"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Wand2 className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium text-white text-sm">Analyserad</span>
              <span className="text-xs text-gray-500 mt-1 text-center">
                AI ställer frågor
              </span>
            </button>

            {/* Category Option */}
            <button
              onClick={() =>
                setActiveBuildMethod(
                  activeBuildMethod === "category" ? null : "category"
                )
              }
              className={`group relative flex flex-col items-center p-5 rounded-xl border transition-all duration-300 ${
                activeBuildMethod === "category"
                  ? "bg-gradient-to-br from-teal-600/20 to-cyan-600/20 border-teal-500/50 shadow-lg shadow-teal-500/10"
                  : "bg-black/50 border-gray-800 hover:border-teal-500/40 hover:bg-teal-950/20"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium text-white text-sm">Kategori</span>
              <span className="text-xs text-gray-500 mt-1 text-center">
                Välj typ av sida
              </span>
              {activeBuildMethod === "category" ? (
                <ChevronUp className="absolute -bottom-1 h-4 w-4 text-teal-400" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>

            {/* Audit Option */}
            <button
              onClick={() =>
                setActiveBuildMethod(
                  activeBuildMethod === "audit" ? null : "audit"
                )
              }
              className={`group relative flex flex-col items-center p-5 rounded-xl border transition-all duration-300 ${
                activeBuildMethod === "audit"
                  ? "bg-gradient-to-br from-amber-600/20 to-orange-600/20 border-amber-500/50 shadow-lg shadow-amber-500/10"
                  : "bg-black/50 border-gray-800 hover:border-amber-500/40 hover:bg-amber-950/20"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Search className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium text-white text-sm">Audit</span>
              <span className="text-xs text-gray-500 mt-1 text-center">
                Analysera befintlig sida
              </span>
              {activeBuildMethod === "audit" ? (
                <ChevronUp className="absolute -bottom-1 h-4 w-4 text-amber-400" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>

            {/* Freeform Option */}
            <button
              onClick={() =>
                setActiveBuildMethod(
                  activeBuildMethod === "freeform" ? null : "freeform"
                )
              }
              className={`group relative flex flex-col items-center p-5 rounded-xl border transition-all duration-300 ${
                activeBuildMethod === "freeform"
                  ? "bg-gradient-to-br from-pink-600/20 to-rose-600/20 border-pink-500/50 shadow-lg shadow-pink-500/10"
                  : "bg-black/50 border-gray-800 hover:border-pink-500/40 hover:bg-pink-950/20"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Pencil className="h-6 w-6 text-white" />
              </div>
              <span className="font-medium text-white text-sm">Fritext</span>
              <span className="text-xs text-gray-500 mt-1 text-center">
                Beskriv din vision
              </span>
              {activeBuildMethod === "freeform" ? (
                <ChevronUp className="absolute -bottom-1 h-4 w-4 text-pink-400" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            EXPANDABLE SECTIONS based on selected build method
            ═══════════════════════════════════════════════════════════ */}

        {/* Category Selection (expanded) */}
        {activeBuildMethod === "category" && (
          <div className="w-full max-w-4xl animate-fadeInUp">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-700/50 to-transparent" />
              <span className="text-sm font-medium text-teal-500/70 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
                Välj kategori
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-teal-700/50 to-transparent" />
            </div>
            <TemplateGallery />
          </div>
        )}

        {/* Site Audit Section (expanded) */}
        {activeBuildMethod === "audit" && (
          <div className="w-full max-w-2xl animate-fadeInUp">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />
              <span className="text-sm font-medium text-amber-500/70 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                Analysera webbplats
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-700/50 to-transparent" />
            </div>
            <SiteAuditSection
              onAuditComplete={handleAuditComplete}
              onRequireAuth={handleRequireAuth}
            />
          </div>
        )}

        {/* Freeform Prompt Section (expanded) */}
        {activeBuildMethod === "freeform" && (
          <div className="w-full max-w-2xl animate-fadeInUp">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-pink-700/50 to-transparent" />
              <span className="text-sm font-medium text-pink-500/70 uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
                Beskriv din vision
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-pink-700/50 to-transparent" />
            </div>
            <PromptInput initialValue={initialContext || undefined} />
            <p className="text-xs text-gray-600 text-center mt-4">
              <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded">
                Enter
              </kbd>{" "}
              för att skicka •
              <kbd className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded ml-1">
                Shift+Enter
              </kbd>{" "}
              för ny rad
            </p>
          </div>
        )}

        {/* Quick tip when no method is selected */}
        {!activeBuildMethod && (
          <p className="text-sm text-gray-500 text-center animate-fadeIn">
            Välj ett alternativ ovan för att börja bygga din webbplats
          </p>
        )}
      </div>
    </main>
  );
}
