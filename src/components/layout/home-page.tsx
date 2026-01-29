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
import { HelpTooltip, Navbar, ShaderBackground, SiteAuditSection } from "./index";
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

  const { showOnboarding, onboardingData, handleComplete, handleSkip, resetOnboarding } =
    useOnboarding();

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
  const handleWizardComplete = (_wizardData: WizardData, expandedPrompt: string) => {
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
          onboardingData.urlPurpose ? purposeText[onboardingData.urlPurpose] : ""
        })`,
      );
    }

    if (onboardingData.analyzeFromWeb) {
      parts.push("Analysera gärna mitt företag från internet för att förstå min verksamhet.");
    }

    if (onboardingData.description) {
      parts.push(onboardingData.description);
    }

    return parts.length > 0 ? parts.join("\n\n") : null;
  };

  const initialContext = getInitialContext();

  return (
    <main className="bg-background min-h-screen">
      {/* Shader Background - shimmer effect for logged in users */}
      {/* Use default theme until auth is initialized to prevent hydration mismatch */}
      <ShaderBackground
        theme={isInitialized && isAuthenticated ? "blue" : "default"}
        speed={0.2}
        opacity={isInitialized && isAuthenticated ? 0.45 : 0.35}
        shimmer={isInitialized && isAuthenticated}
        shimmerSpeed={10}
      />

      {/* Navbar */}
      <Navbar onLoginClick={handleLoginClick} onRegisterClick={handleRegisterClick} />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
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
      {showOnboarding && <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />}

      {/* Reset onboarding button (dev/testing only) */}
      <button
        onClick={resetOnboarding}
        className="fixed bottom-4 left-4 z-50 inline-flex items-center gap-2 border border-gray-700 bg-black/70 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-black/90 hover:text-gray-300"
        title="Visa introduktion igen"
      >
        <RotateCcw className="h-3 w-3" />
        Intro
      </button>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-12 px-4 pt-24 pb-16">
        {/* Personalized greeting for logged-in users */}
        {/* Only render after auth is initialized to prevent hydration mismatch */}
        {isInitialized && isAuthenticated && firstName && (
          <div className="animate-fadeIn text-center">
            <div className="from-brand-blue/10 via-brand-amber/10 to-brand-warm/10 border-brand-blue/30 mb-4 inline-flex items-center gap-2 rounded-full border bg-linear-to-r px-4 py-2">
              <Sparkles className="text-brand-amber h-4 w-4" />
              <span className="text-sm text-gray-300">
                Välkommen tillbaka, <span className="font-medium text-white">{firstName}</span>!
              </span>
              <span className="text-xs text-gray-500">{user?.diamonds ?? 0} 💎</span>
            </div>
          </div>
        )}

        {/* Header - Main heading with animated entrance */}
        {/* Use default text until auth is initialized to prevent hydration mismatch */}
        <div className="animate-fadeInUp space-y-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            {isInitialized && isAuthenticated
              ? "Vad vill du skapa idag?"
              : "Vad vill du bygga idag?"}
          </h1>
          <p className="mx-auto flex max-w-md items-center justify-center gap-2 text-sm text-gray-400 sm:text-base">
            {isInitialized && isAuthenticated
              ? "Dina projekt och analyser sparas automatiskt i ditt konto."
              : "Skapa professionella webbplatser på minuter med hjälp av AI."}
            <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
          </p>
        </div>

        {/* Show context from onboarding if available */}
        {initialContext && (
          <div className="w-full max-w-2xl border border-gray-700 bg-black/70 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-brand-teal text-xs font-medium">✓ Din information sparad</span>
              <button
                onClick={resetOnboarding}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Ändra
              </button>
            </div>
            <p className="line-clamp-3 text-sm whitespace-pre-line text-gray-400">
              {initialContext}
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            BUILD METHOD SELECTION
            Clear options for how to start building
            ═══════════════════════════════════════════════════════════ */}
        <div className="animate-fadeInUp stagger-2 w-full max-w-4xl [animation-fill-mode:forwards]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {/* Analyzed Option - Opens AI wizard directly */}
            <button
              onClick={() => setShowWizard(true)}
              className="group hover:border-brand-blue/40 hover:bg-brand-blue/10 relative flex flex-col items-center rounded-xl border border-gray-800 bg-black/50 p-5 transition-all duration-300"
            >
              <div className="from-brand-blue to-brand-teal mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br transition-transform group-hover:scale-110">
                <Wand2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-white">Analyserad</span>
              <span className="mt-1 text-center text-xs text-gray-500">AI ställer frågor</span>
            </button>

            {/* Category Option */}
            <button
              onClick={() =>
                setActiveBuildMethod(activeBuildMethod === "category" ? null : "category")
              }
              className={`group relative flex flex-col items-center rounded-xl border p-5 transition-all duration-300 ${
                activeBuildMethod === "category"
                  ? "from-brand-teal/20 to-brand-blue/10 border-brand-teal/50 shadow-brand-teal/10 bg-linear-to-br shadow-lg"
                  : "hover:border-brand-teal/40 hover:bg-brand-teal/10 border-gray-800 bg-black/50"
              }`}
            >
              <div className="from-brand-teal to-brand-blue mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br transition-transform group-hover:scale-110">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-white">Kategori</span>
              <span className="mt-1 text-center text-xs text-gray-500">Välj typ av sida</span>
              {activeBuildMethod === "category" ? (
                <ChevronUp className="text-brand-teal absolute -bottom-1 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>

            {/* Audit Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "audit" ? null : "audit")}
              className={`group relative flex flex-col items-center rounded-xl border p-5 transition-all duration-300 ${
                activeBuildMethod === "audit"
                  ? "from-brand-amber/20 to-brand-warm/20 border-brand-amber/50 shadow-brand-amber/10 bg-linear-to-br shadow-lg"
                  : "hover:border-brand-amber/40 hover:bg-brand-amber/10 border-gray-800 bg-black/50"
              }`}
            >
              <div className="from-brand-amber to-brand-warm mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br transition-transform group-hover:scale-110">
                <Search className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-white">Audit</span>
              <span className="mt-1 text-center text-xs text-gray-500">
                Analysera befintlig sida
              </span>
              {activeBuildMethod === "audit" ? (
                <ChevronUp className="text-brand-amber absolute -bottom-1 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>

            {/* Freeform Option */}
            <button
              onClick={() =>
                setActiveBuildMethod(activeBuildMethod === "freeform" ? null : "freeform")
              }
              className={`group relative flex flex-col items-center rounded-xl border p-5 transition-all duration-300 ${
                activeBuildMethod === "freeform"
                  ? "from-brand-warm/20 to-brand-amber/20 border-brand-warm/50 shadow-brand-warm/10 bg-linear-to-br shadow-lg"
                  : "hover:border-brand-warm/40 hover:bg-brand-warm/10 border-gray-800 bg-black/50"
              }`}
            >
              <div className="from-brand-warm to-brand-amber mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br transition-transform group-hover:scale-110">
                <Pencil className="h-6 w-6 text-white" />
              </div>
              <span className="text-sm font-medium text-white">Fritext</span>
              <span className="mt-1 text-center text-xs text-gray-500">Beskriv din vision</span>
              {activeBuildMethod === "freeform" ? (
                <ChevronUp className="text-brand-warm absolute -bottom-1 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-1 h-4 w-4 text-gray-600 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            EXPANDABLE SECTIONS based on selected build method
            ═══════════════════════════════════════════════════════════ */}

        {/* Category Selection (expanded) */}
        {activeBuildMethod === "category" && (
          <div className="animate-fadeInUp w-full max-w-4xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="via-brand-teal/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
              <span className="text-brand-teal/70 flex items-center gap-2 text-sm font-medium tracking-wider uppercase">
                <span className="bg-brand-teal h-1.5 w-1.5 animate-pulse rounded-full" />
                Välj kategori
              </span>
              <div className="via-brand-teal/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
            </div>
            <TemplateGallery />
          </div>
        )}

        {/* Site Audit Section (expanded) */}
        {activeBuildMethod === "audit" && (
          <div className="animate-fadeInUp w-full max-w-2xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="via-brand-amber/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
              <span className="text-brand-amber/70 flex items-center gap-2 text-sm font-medium tracking-wider uppercase">
                <span className="bg-brand-amber h-1.5 w-1.5 animate-pulse rounded-full" />
                Analysera webbplats
              </span>
              <div className="via-brand-amber/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
            </div>
            <SiteAuditSection
              onAuditComplete={handleAuditComplete}
              onRequireAuth={handleRequireAuth}
            />
          </div>
        )}

        {/* Freeform Prompt Section (expanded) */}
        {activeBuildMethod === "freeform" && (
          <div className="animate-fadeInUp w-full max-w-2xl">
            <div className="mb-6 flex items-center gap-4">
              <div className="via-brand-warm/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
              <span className="text-brand-warm/70 flex items-center gap-2 text-sm font-medium tracking-wider uppercase">
                <span className="bg-brand-warm h-1.5 w-1.5 animate-pulse rounded-full" />
                Beskriv din vision
              </span>
              <div className="via-brand-warm/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
            </div>
            <PromptInput initialValue={initialContext || undefined} />
            <p className="mt-4 text-center text-xs text-gray-600">
              <kbd className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                Enter
              </kbd>{" "}
              för att skicka •
              <kbd className="ml-1 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                Shift+Enter
              </kbd>{" "}
              för ny rad
            </p>
          </div>
        )}

        {/* Quick tip when no method is selected */}
        {!activeBuildMethod && (
          <p className="animate-fadeIn text-center text-sm text-gray-500">
            Välj ett alternativ ovan för att börja bygga din webbplats
          </p>
        )}
      </div>
    </main>
  );
}
