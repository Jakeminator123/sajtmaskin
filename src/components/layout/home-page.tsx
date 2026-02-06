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

import { useMemo, useState } from "react";
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
import { TrustedByMarquee } from "./trusted-by-marquee";
import {
  RotateCcw,
  Wand2,
  FolderOpen,
  Search,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-store";
import {
  BUILD_INTENT_OPTIONS,
  DEFAULT_BUILD_INTENT,
  resolveBuildIntentForMethod,
  type BuildIntent,
  type BuildMethod,
} from "@/lib/builder/build-intent";
import type { AuditResult } from "@/types/audit";
import toast from "react-hot-toast";

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

type ActiveBuildMethod = BuildMethod | null;

export function HomePage() {
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditedUrl, setAuditedUrl] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [activeBuildMethod, setActiveBuildMethod] = useState<ActiveBuildMethod>(null);
  const [buildIntent, setBuildIntent] = useState<BuildIntent>(DEFAULT_BUILD_INTENT);
  // Note: auditGeneratedPrompt removed - audit navigates to builder via promptId

  // Get user state for personalized experience
  // IMPORTANT: Use isInitialized to prevent hydration mismatch
  const { user, isAuthenticated, isInitialized } = useAuth();

  const { showOnboarding, onboardingData, handleComplete, handleSkip, resetOnboarding } =
    useOnboarding();

  // Get user's first name for greeting
  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || undefined;

  const selectedIntent = useMemo(
    () => BUILD_INTENT_OPTIONS.find((option) => option.value === buildIntent),
    [buildIntent],
  );

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

  // Handle "Build site from audit" - navigate to builder with promptId
  const handleBuildFromAudit = async (prompt: string) => {
    setShowAuditModal(false);

    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: "audit" }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        promptId?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.promptId) {
        const message = data?.error || "Kunde inte spara audit‑prompten";
        throw new Error(message);
      }
      const intent = resolveBuildIntentForMethod("audit", buildIntent);
      const params = new URLSearchParams();
      params.set("source", "audit");
      params.set("promptId", data.promptId);
      params.set("buildMethod", "audit");
      params.set("buildIntent", intent);
      router.push(`/builder?${params.toString()}`);
    } catch (error) {
      console.error("[HomePage] Failed to create audit prompt handoff:", error);
      toast.error(error instanceof Error ? error.message : "Kunde inte spara audit‑prompten");
    }
  };

  const handleBuildFromPrompt = async (prompt: string, method: BuildMethod = "freeform") => {
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: method }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        promptId?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.promptId) {
        const message = data?.error || "Kunde inte spara prompten";
        throw new Error(message);
      }
      const intent = resolveBuildIntentForMethod(method, buildIntent);
      const params = new URLSearchParams();
      params.set("promptId", data.promptId);
      params.set("buildMethod", method);
      params.set("buildIntent", intent);
      router.push(`/builder?${params.toString()}`);
    } catch (error) {
      console.error("[HomePage] Failed to create prompt handoff:", error);
      toast.error(error instanceof Error ? error.message : "Kunde inte spara prompten");
    }
  };

  // Handle wizard completion - navigate to builder with expanded prompt
  const handleWizardComplete = (_wizardData: WizardData, expandedPrompt: string) => {
    setShowWizard(false);
    handleBuildFromPrompt(expandedPrompt, "wizard");
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
        buildIntent={buildIntent}
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
              <Wand2 className="text-brand-amber h-4 w-4" />
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

        <div className="mb-4 flex w-full max-w-4xl flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-gray-500 uppercase">
            <span>Mål</span>
            <HelpTooltip
              text="Mall = snabb start med liten scope. Webbplats = marknads-/infosida. App = mer logik, flöden och data."
              className="bg-black"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {BUILD_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setBuildIntent(option.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  buildIntent === option.value
                    ? "border-brand-blue/60 bg-brand-blue/20 text-white"
                    : "border-gray-800 bg-black/50 text-gray-400 hover:border-gray-700 hover:text-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedIntent?.description ? (
            <p className="text-xs text-gray-500">{selectedIntent.description}</p>
          ) : null}
        </div>

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
          <div className="animate-fadeInUp w-full max-w-4xl min-h-[200px]">
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
          <div className="animate-fadeInUp w-full max-w-2xl min-h-[180px]">
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
          <div className="animate-fadeInUp w-full max-w-2xl min-h-[280px]">
            <div className="mb-6 flex items-center gap-4">
              <div className="via-brand-warm/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
              <span className="text-brand-warm/70 flex items-center gap-2 text-sm font-medium tracking-wider uppercase">
                <span className="bg-brand-warm h-1.5 w-1.5 animate-pulse rounded-full" />
                Beskriv din vision
              </span>
              <div className="via-brand-warm/50 h-px flex-1 bg-linear-to-r from-transparent to-transparent" />
            </div>
            <PromptInput
              initialValue={initialContext || undefined}
              buildIntent={buildIntent}
              buildMethod="freeform"
            />
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

      {/* Trusted by marquee */}
      <TrustedByMarquee />
    </main>
  );
}
