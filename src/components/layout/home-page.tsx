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

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center space-y-10 px-4 pt-24 pb-16">
        {/* Personalized greeting for logged-in users */}
        {isInitialized && isAuthenticated && firstName && (
          <div className="animate-fadeIn text-center" style={{ animationDelay: "0.1s" }}>
            <div className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-white/5 px-5 py-2.5 backdrop-blur-md transition-all duration-500 hover:border-white/20 hover:bg-white/10">
              {/* Animated gradient border glow */}
              <div className="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "linear-gradient(90deg, rgba(59,130,246,0.15), rgba(245,158,11,0.15), rgba(20,184,166,0.15))", filter: "blur(8px)" }} />
              <div className="relative flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-brand-blue to-brand-teal">
                  <Wand2 className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm text-gray-300">
                  Välkommen tillbaka, <span className="font-semibold text-white">{firstName}</span>
                </span>
                <div className="flex items-center gap-1 rounded-full bg-brand-amber/20 px-2.5 py-0.5">
                  <span className="text-xs font-bold text-brand-amber">{user?.diamonds ?? 0}</span>
                  <span className="text-xs">💎</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hero heading with gradient text */}
        <div className="animate-fadeInUp space-y-5 text-center" style={{ animationDelay: "0.2s" }}>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            <span className="bg-linear-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
              {isInitialized && isAuthenticated
                ? "Vad vill du skapa"
                : "Vad vill du bygga"}
            </span>
            <br />
            <span className="bg-linear-to-r from-brand-teal via-brand-blue to-brand-amber bg-clip-text text-transparent">
              idag?
            </span>
          </h1>
          <p className="mx-auto flex max-w-lg items-center justify-center gap-2 text-sm text-gray-400 sm:text-base">
            {isInitialized && isAuthenticated
              ? "Dina projekt och analyser sparas automatiskt i ditt konto."
              : "Skapa professionella webbplatser på minuter med hjälp av AI."}
            <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
          </p>
        </div>

        {/* Onboarding context */}
        {initialContext && (
          <div className="animate-fadeIn w-full max-w-2xl rounded-xl border border-gray-700/50 bg-white/5 p-4 backdrop-blur-sm">
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

        {/* Build intent selector */}
        <div className="animate-fadeInUp flex w-full max-w-4xl flex-col items-center gap-3" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
            <div className="h-px w-8 bg-gray-700" />
            <span>Mål</span>
            <HelpTooltip
              text="Mall = snabb start med liten scope. Webbplats = marknads-/infosida. App = mer logik, flöden och data."
              className="bg-black"
            />
            <div className="h-px w-8 bg-gray-700" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {BUILD_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setBuildIntent(option.value)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-300 ${
                  buildIntent === option.value
                    ? "border-brand-blue/60 bg-brand-blue/20 text-white shadow-lg shadow-brand-blue/10"
                    : "border-gray-800 bg-black/50 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedIntent?.description ? (
            <p className="text-center text-xs text-gray-500">{selectedIntent.description}</p>
          ) : null}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            BUILD METHOD SELECTION - 4 animated cards
            ═══════════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {/* Analyzed Option */}
            <button
              onClick={() => setShowWizard(true)}
              className="animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border border-gray-800/80 bg-black/40 p-6 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-brand-blue/40 hover:shadow-xl hover:shadow-brand-blue/5"
              style={{ animationDelay: "0.35s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%)" }} />
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-blue to-brand-teal shadow-lg shadow-brand-blue/20 transition-all duration-500 group-hover:scale-110 group-hover:shadow-brand-blue/40">
                <Wand2 className="h-6 w-6 text-white" />
              </div>
              <span className="relative text-sm font-semibold text-white">Analyserad</span>
              <span className="relative mt-1 text-center text-xs text-gray-500">AI ställer frågor</span>
            </button>

            {/* Category Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "category" ? null : "category")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 ${
                activeBuildMethod === "category"
                  ? "border-brand-teal/50 bg-brand-teal/5 shadow-xl shadow-brand-teal/10"
                  : "border-gray-800/80 bg-black/40 hover:border-brand-teal/40 hover:shadow-xl hover:shadow-brand-teal/5"
              }`}
              style={{ animationDelay: "0.45s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 50% 0%, rgba(20,184,166,0.12) 0%, transparent 70%)" }} />
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-teal to-brand-blue shadow-lg shadow-brand-teal/20 transition-all duration-500 group-hover:scale-110 group-hover:shadow-brand-teal/40">
                <FolderOpen className="h-6 w-6 text-white" />
              </div>
              <span className="relative text-sm font-semibold text-white">Kategori</span>
              <span className="relative mt-1 text-center text-xs text-gray-500">Välj typ av sida</span>
              {activeBuildMethod === "category" ? (
                <ChevronUp className="text-brand-teal absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-gray-600 opacity-0 transition-all group-hover:opacity-100" />
              )}
            </button>

            {/* Audit Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "audit" ? null : "audit")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 ${
                activeBuildMethod === "audit"
                  ? "border-brand-amber/50 bg-brand-amber/5 shadow-xl shadow-brand-amber/10"
                  : "border-gray-800/80 bg-black/40 hover:border-brand-amber/40 hover:shadow-xl hover:shadow-brand-amber/5"
              }`}
              style={{ animationDelay: "0.55s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 70%)" }} />
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-amber to-brand-warm shadow-lg shadow-brand-amber/20 transition-all duration-500 group-hover:scale-110 group-hover:shadow-brand-amber/40">
                <Search className="h-6 w-6 text-white" />
              </div>
              <span className="relative text-sm font-semibold text-white">Audit</span>
              <span className="relative mt-1 text-center text-xs text-gray-500">Analysera befintlig sida</span>
              {activeBuildMethod === "audit" ? (
                <ChevronUp className="text-brand-amber absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-gray-600 opacity-0 transition-all group-hover:opacity-100" />
              )}
            </button>

            {/* Freeform Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "freeform" ? null : "freeform")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-6 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 ${
                activeBuildMethod === "freeform"
                  ? "border-brand-warm/50 bg-brand-warm/5 shadow-xl shadow-brand-warm/10"
                  : "border-gray-800/80 bg-black/40 hover:border-brand-warm/40 hover:shadow-xl hover:shadow-brand-warm/5"
              }`}
              style={{ animationDelay: "0.65s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 70%)" }} />
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-warm to-brand-amber shadow-lg shadow-brand-warm/20 transition-all duration-500 group-hover:scale-110 group-hover:shadow-brand-warm/40">
                <Pencil className="h-6 w-6 text-white" />
              </div>
              <span className="relative text-sm font-semibold text-white">Fritext</span>
              <span className="relative mt-1 text-center text-xs text-gray-500">Beskriv din vision</span>
              {activeBuildMethod === "freeform" ? (
                <ChevronUp className="text-brand-warm absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-gray-600 opacity-0 transition-all group-hover:opacity-100" />
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

        {/* Feature highlights when no method is selected */}
        {!activeBuildMethod && (
          <div className="w-full max-w-4xl space-y-10">
            {/* Animated CTA with gradient line */}
            <div className="animate-fadeIn flex items-center gap-4" style={{ animationDelay: "0.8s" }}>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-gray-700/50 to-transparent" />
              <p className="text-xs font-medium tracking-wider text-gray-500 uppercase">
                Välj ovan eller utforska
              </p>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-gray-700/50 to-transparent" />
            </div>

            {/* Feature cards with staggered animation */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <Wand2 className="h-5 w-5" />,
                  color: "brand-teal",
                  title: "AI-driven design",
                  desc: "Berätta om ditt företag och få en skräddarsydd webbplats baserad på din bransch och målgrupp.",
                  delay: "0.9s",
                },
                {
                  icon: <Search className="h-5 w-5" />,
                  color: "brand-blue",
                  title: "Gratis webbplatsanalys",
                  desc: "Analysera din befintliga sajt med AI och få en detaljerad rapport med förbättringsförslag.",
                  delay: "1.0s",
                },
                {
                  icon: <Pencil className="h-5 w-5" />,
                  color: "brand-amber",
                  title: "Röst och video",
                  desc: "Beskriv din vision med rösten eller spela in en presentation — AI bygger utifrån det.",
                  delay: "1.1s",
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="animate-fadeInUp group relative overflow-hidden rounded-2xl border border-gray-800/50 bg-black/30 p-5 backdrop-blur-sm transition-all duration-500 hover:-translate-y-1 hover:border-gray-700/80 hover:bg-black/50 hover:shadow-lg"
                  style={{ animationDelay: feature.delay, animationFillMode: "forwards", opacity: 0 }}
                >
                  {/* Hover glow */}
                  <div className={`absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 bg-linear-to-b from-${feature.color}/5 to-transparent`} />
                  <div className={`relative mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-${feature.color}/10 text-${feature.color} transition-transform duration-300 group-hover:scale-110`}>
                    {feature.icon}
                  </div>
                  <h3 className="relative mb-1.5 text-sm font-semibold text-white">{feature.title}</h3>
                  <p className="relative text-xs leading-relaxed text-gray-500">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Animated stats row */}
            <div className="animate-fadeIn flex items-center justify-center gap-6 sm:gap-10" style={{ animationDelay: "1.2s" }}>
              {[
                { value: "5 sek", label: "Första utkast" },
                { value: "100+", label: "Mallar" },
                { value: "SEO", label: "Inbyggd audit" },
                { value: "1-klick", label: "Publicering" },
              ].map((stat, i) => (
                <div key={stat.label} className="group text-center">
                  {i > 0 && <div className="hidden" />}
                  <p className="text-lg font-bold text-white transition-colors group-hover:text-brand-teal">{stat.value}</p>
                  <p className="text-[10px] font-medium tracking-widest text-gray-600 uppercase">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trusted by marquee */}
      <TrustedByMarquee />
    </main>
  );
}
