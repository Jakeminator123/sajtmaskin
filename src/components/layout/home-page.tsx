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

import { useEffect, useMemo, useState } from "react";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { useRouter } from "next/navigation";
import { TemplateGallery } from "@/components/templates";
import { PromptInput } from "@/components/forms";
import {
  OnboardingModal,
  useOnboarding,
  AuditModal,
  PromptWizardModalV2,
  EntryModal,
  WelcomeOverlay,
  type WizardData,
} from "@/components/modals";
import { useEntryParams } from "@/lib/entry";
import { AuthModal } from "@/components/auth";
import { HelpTooltip, Navbar, ShaderBackground, SiteAuditSection } from "./index";
import { TrustedByMarquee } from "./trusted-by-marquee";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Progress } from "@/components/ui/progress";
import {
  RotateCcw,
  Wand2,
  FolderOpen,
  Search,
  Pencil,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
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
import { createProject } from "@/lib/project-client";

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

  // ── Entry params (sajtstudio.se → sajtmaskin flow, see lib/entry/) ──
  const entry = useEntryParams();

  // Get user state for personalized experience
  // IMPORTANT: Use isInitialized to prevent hydration mismatch
  const { user, isAuthenticated, isInitialized } = useAuth();

  const { showOnboarding, onboardingData, handleComplete, handleSkip, resetOnboarding } =
    useOnboarding();

  // ── Direct entry activation (no modal, e.g. ?mode=audit without company) ──
  useEffect(() => {
    // If welcome overlay is active, wait for it to be dismissed first
    if (!entry.directAction || entry.showWelcome) return;

    if (entry.directAction === "audit") {
      setActiveBuildMethod("audit");
    } else if (entry.directAction === "wizard") {
      setShowWizard(true);
    } else if (entry.directAction === "freeform") {
      setActiveBuildMethod("freeform");
    }
  }, [entry.directAction, entry.showWelcome]);

  // Handle welcome overlay "Continue" — dismiss overlay, then directAction effect fires
  const handleWelcomeContinue = () => {
    entry.dismissWelcome();
  };

  // Handle entry modal "Continue" — activate the appropriate section/modal
  const handleEntryContinue = () => {
    const result = entry.continueEntry();
    if (!result) return;

    if (result.action === "wizard") {
      setShowWizard(true);
    } else if (result.action === "audit") {
      setActiveBuildMethod("audit");
    } else if (result.action === "freeform") {
      setActiveBuildMethod("freeform");
    }
  };

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
      // Create app project first (same pattern as category page)
      const project = await createProject(
        `Audit - ${new Date().toLocaleDateString("sv-SE")}`,
        "audit",
        prompt.substring(0, 100),
      );

      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: "audit", projectId: project.id }),
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
      params.set("project", project.id);
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
      // Create app project first (same pattern as category page)
      const project = await createProject(
        `Nytt projekt - ${new Date().toLocaleDateString("sv-SE")}`,
        method,
        prompt.substring(0, 100),
      );

      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, source: method, projectId: project.id }),
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
      params.set("project", project.id);
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

  const [testimonialsApi, setTestimonialsApi] = useState<UseEmblaCarouselType[1] | null>(null);

  useEffect(() => {
    if (!testimonialsApi) return;
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    const interval = window.setInterval(() => {
      if (testimonialsApi.canScrollNext()) {
        testimonialsApi.scrollNext();
      } else {
        testimonialsApi.scrollTo(0);
      }
    }, 5200);
    return () => window.clearInterval(interval);
  }, [testimonialsApi]);

  const impactStats = [
    {
      label: "Time-to-first-draft",
      description: "Från idé till första version på några minuter.",
      value: 92,
      accent: "text-brand-teal",
      icon: Timer,
    },
    {
      label: "Designkvalitet",
      description: "Konsekvent UI med shadcn/ui och tokens.",
      value: 88,
      accent: "text-brand-blue",
      icon: Sparkles,
    },
    {
      label: "Trygg lansering",
      description: "Automatiska checks och tydliga nästa steg.",
      value: 79,
      accent: "text-brand-amber",
      icon: ShieldCheck,
    },
  ];

  const processSteps = [
    {
      title: "Beskriv din idé",
      description: "Skriv, tala eller ladda upp material. AI tolkar och strukturerar.",
    },
    {
      title: "Välj mall eller palett",
      description: "Utgå från mallar eller lägg till komponenter i din palett.",
    },
    {
      title: "Förfina i chatten",
      description: "Justera layout, copy och animationer med enkla kommandon.",
    },
    {
      title: "Publicera tryggt",
      description: "Se preview, kör audit och gå live med ett klick.",
    },
  ];

  const testimonials = [
    {
      quote:
        "Vi gick från idé till live-sida på en lunch. Den kändes som ett designteam byggt den.",
      name: "Alex K.",
      role: "Founder, Nordic Labs",
    },
    {
      quote:
        "Sajtmaskin gav oss en professionell layout direkt, och justeringar var superenkla.",
      name: "Maja B.",
      role: "Marketing Lead, Fjordly",
    },
    {
      quote: "Palett‑tänket är guld. Jag kan bygga vidare utan att tappa stilen.",
      name: "Jonas R.",
      role: "Product Designer",
    },
    {
      quote:
        "Våra kampanjsidor laddar snabbare och ser mer premium ut än tidigare.",
      name: "Elina S.",
      role: "Growth, Driftline",
    },
  ];

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

      {/* Entry Modal — shown when users arrive via external links with ?mode=xxx */}
      {entry.mode && (
        <EntryModal
          mode={entry.mode}
          partner={entry.partner}
          onContinue={handleEntryContinue}
          onClose={entry.dismissEntry}
        />
      )}

      {/* Welcome Overlay — shown when arriving with ?company=xxx&mode=audit */}
      {entry.showWelcome && entry.company && (
        <WelcomeOverlay
          company={entry.company}
          onContinue={handleWelcomeContinue}
        />
      )}

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
        initialCompanyName={entry.company ?? ""}
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

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pt-28 pb-20">
        {/* Personalized greeting for logged-in users */}
        {isInitialized && isAuthenticated && firstName && (
          <div className="animate-fadeIn mb-8" style={{ animationDelay: "0.1s", animationFillMode: "forwards", opacity: 0 }}>
            <div className="inline-flex items-center gap-3 rounded-full border border-white/8 bg-white/3 px-5 py-2.5 backdrop-blur-xl">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-[11px] font-semibold tracking-wide text-white/70">
                {firstName[0]?.toUpperCase()}
              </div>
              <span className="text-[13px] text-white/60">
                Välkommen, <span className="font-medium text-white/80">{firstName}</span>
              </span>
              <div className="h-3.5 w-px bg-white/8" />
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-white/55">{user?.diamonds ?? 0}</span>
                <span className="text-[11px]">💎</span>
              </div>
            </div>
          </div>
        )}

        {/* Hero heading */}
        <div className="animate-fadeInUp mb-6 text-center" style={{ animationDelay: "0.15s" }}>
          <h1 className="text-5xl font-bold tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-[5.5rem]">
            <span className="text-white">
              {isInitialized && isAuthenticated
                ? "Vad vill du skapa"
                : "Vad vill du bygga"}
            </span>
            <br />
            <span className="animate-gradient-slow bg-linear-to-r from-brand-blue via-[hsl(260,65%,65%)] to-brand-teal bg-size-[300%_auto] bg-clip-text text-transparent">
              idag?
            </span>
          </h1>
        </div>
        <p className="animate-fadeInUp mb-12 flex items-center justify-center gap-2 text-[15px] leading-relaxed text-white/70" style={{ animationDelay: "0.25s" }}>
          {isInitialized && isAuthenticated
            ? "Dina projekt och analyser sparas automatiskt i ditt konto."
            : "Skapa professionella webbplatser på minuter med hjälp av AI."}
          <HelpTooltip text="Välj en kategori för att komma igång snabbt, eller beskriv din webbplats med egna ord i textfältet nedan." />
        </p>

        {/* Onboarding context */}
        {initialContext && (
          <div className="animate-fadeIn mb-6 w-full max-w-2xl rounded-xl border border-white/6 bg-white/2 p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-brand-teal/70">✓ Din information sparad</span>
              <button
                onClick={resetOnboarding}
                className="text-[12px] text-white/60 transition-colors hover:text-white/80"
              >
                Ändra
              </button>
            </div>
            <p className="line-clamp-3 text-[13px] whitespace-pre-line text-white/70">
              {initialContext}
            </p>
          </div>
        )}

        {/* Build intent selector */}
        <div className="animate-fadeInUp mb-10 flex flex-col items-center gap-3" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-[0.15em] text-white/60 uppercase">Mål</span>
            <HelpTooltip
              text="Mall = snabb start med liten scope. Webbplats = marknads-/infosida. App = mer logik, flöden och data."
              className="bg-black"
            />
          </div>
          <div className="flex items-center rounded-full border border-white/6 bg-white/2 p-1 backdrop-blur-md">
            {BUILD_INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setBuildIntent(option.value)}
                className={`rounded-full px-5 py-2 text-[13px] font-medium transition-all duration-300 ${
                  buildIntent === option.value
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/70 hover:text-white/90"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedIntent?.description ? (
            <p className="mt-1 text-center text-[12px] text-white/60">{selectedIntent.description}</p>
          ) : null}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            BUILD METHOD SELECTION - 4 premium glass cards
            ═══════════════════════════════════════════════════════════ */}
        <div className="w-full max-w-3xl mb-12">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {/* Analyzed Option */}
            <button
              onClick={() => setShowWizard(true)}
              className="animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border border-white/6 bg-white/2 p-7 backdrop-blur-sm transition-all duration-500 hover:border-brand-blue/20 hover:bg-white/5"
              style={{ animationDelay: "0.35s", animationFillMode: "forwards" }}
            >
              {/* Subtle top edge highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/6 to-transparent" />
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue/10 transition-all duration-500 group-hover:bg-brand-blue/15 group-hover:scale-105">
                <Wand2 className="h-5 w-5 text-brand-blue" />
              </div>
              <span className="text-[14px] font-semibold text-white">Analyserad</span>
              <span className="mt-1.5 text-center text-[12px] text-white/70">AI ställer frågor</span>
            </button>

            {/* Category Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "category" ? null : "category")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-7 backdrop-blur-sm transition-all duration-500 ${
                activeBuildMethod === "category"
                  ? "border-brand-teal/20 bg-brand-teal/4"
                  : "border-white/6 bg-white/2 hover:border-brand-teal/15 hover:bg-white/5"
              }`}
              style={{ animationDelay: "0.45s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/6 to-transparent" />
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(20,184,166,0.08) 0%, transparent 70%)" }} />
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal/10 transition-all duration-500 group-hover:bg-brand-teal/15 group-hover:scale-105">
                <FolderOpen className="h-5 w-5 text-brand-teal" />
              </div>
              <span className="text-[14px] font-semibold text-white">Kategori</span>
              <span className="mt-1.5 text-center text-[12px] text-white/70">Välj typ av sida</span>
              {activeBuildMethod === "category" ? (
                <ChevronUp className="text-brand-teal absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-white/15 opacity-0 transition-all group-hover:opacity-100" />
              )}
            </button>

            {/* Audit Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "audit" ? null : "audit")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-7 backdrop-blur-sm transition-all duration-500 ${
                activeBuildMethod === "audit"
                  ? "border-brand-amber/20 bg-brand-amber/4"
                  : "border-white/6 bg-white/2 hover:border-brand-amber/15 hover:bg-white/5"
              }`}
              style={{ animationDelay: "0.55s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/6 to-transparent" />
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(245,158,11,0.08) 0%, transparent 70%)" }} />
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-amber/10 transition-all duration-500 group-hover:bg-brand-amber/15 group-hover:scale-105">
                <Search className="h-5 w-5 text-brand-amber" />
              </div>
              <span className="text-[14px] font-semibold text-white">Audit</span>
              <span className="mt-1.5 text-center text-[12px] text-white/70">Analysera befintlig sida</span>
              {activeBuildMethod === "audit" ? (
                <ChevronUp className="text-brand-amber absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-white/15 opacity-0 transition-all group-hover:opacity-100" />
              )}
            </button>

            {/* Freeform Option */}
            <button
              onClick={() => setActiveBuildMethod(activeBuildMethod === "freeform" ? null : "freeform")}
              className={`animate-fadeInUp group relative flex flex-col items-center overflow-hidden rounded-2xl border p-7 backdrop-blur-sm transition-all duration-500 ${
                activeBuildMethod === "freeform"
                  ? "border-brand-warm/20 bg-brand-warm/4"
                  : "border-white/6 bg-white/2 hover:border-brand-warm/15 hover:bg-white/5"
              }`}
              style={{ animationDelay: "0.65s", animationFillMode: "forwards" }}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/6 to-transparent" />
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(239,68,68,0.06) 0%, transparent 70%)" }} />
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-warm/10 transition-all duration-500 group-hover:bg-brand-warm/15 group-hover:scale-105">
                <Pencil className="h-5 w-5 text-brand-warm" />
              </div>
              <span className="text-[14px] font-semibold text-white">Fritext</span>
              <span className="mt-1.5 text-center text-[12px] text-white/70">Beskriv din vision</span>
              {activeBuildMethod === "freeform" ? (
                <ChevronUp className="text-brand-warm absolute -bottom-0.5 h-4 w-4" />
              ) : (
                <ChevronDown className="absolute -bottom-0.5 h-4 w-4 text-white/15 opacity-0 transition-all group-hover:opacity-100" />
              )}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            EXPANDABLE SECTIONS based on selected build method
            ═══════════════════════════════════════════════════════════ */}

        {/* Category Selection (expanded) */}
        {activeBuildMethod === "category" && (
          <div className="animate-fadeInUp w-full max-w-3xl min-h-[200px]">
            <div className="mb-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-teal/20 to-transparent" />
              <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.15em] text-brand-teal/50 uppercase">
                <span className="h-1 w-1 rounded-full bg-brand-teal/50" />
                Välj kategori
              </span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-teal/20 to-transparent" />
            </div>
            <TemplateGallery />
          </div>
        )}

        {/* Site Audit Section (expanded) */}
        {activeBuildMethod === "audit" && (
          <div className="animate-fadeInUp w-full max-w-2xl min-h-[180px]">
            <div className="mb-6 flex items-center gap-4">
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-amber/20 to-transparent" />
              <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.15em] text-brand-amber/50 uppercase">
                <span className="h-1 w-1 rounded-full bg-brand-amber/50" />
                Analysera webbplats
              </span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-amber/20 to-transparent" />
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
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-warm/20 to-transparent" />
              <span className="flex items-center gap-2 text-[11px] font-medium tracking-[0.15em] text-brand-warm/50 uppercase">
                <span className="h-1 w-1 rounded-full bg-brand-warm/50" />
                Beskriv din vision
              </span>
              <div className="h-px flex-1 bg-linear-to-r from-transparent via-brand-warm/20 to-transparent" />
            </div>
            <PromptInput
              initialValue={initialContext || undefined}
              buildIntent={buildIntent}
              buildMethod="freeform"
            />
            <p className="mt-4 text-center text-[11px] text-white/60">
              <kbd className="rounded border border-white/6 bg-white/3 px-1.5 py-0.5 text-[10px] text-white/70">
                Enter
              </kbd>{" "}
              för att skicka •
              <kbd className="ml-1 rounded border border-white/6 bg-white/3 px-1.5 py-0.5 text-[10px] text-white/70">
                Shift+Enter
              </kbd>{" "}
              för ny rad
            </p>
          </div>
        )}

        {/* Feature highlights when no method is selected */}
        {!activeBuildMethod && (
          <div className="w-full max-w-3xl space-y-14">
            {/* Feature cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* AI-driven design */}
              <div
                className="animate-fadeInUp group relative overflow-hidden rounded-2xl border border-white/6 bg-white/2 p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/10 hover:bg-white/4"
                style={{ animationDelay: "0.8s", animationFillMode: "forwards", opacity: 0 }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/4 to-transparent" />
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/10 transition-all duration-500 group-hover:bg-brand-teal/15">
                  <Wand2 className="h-4.5 w-4.5 text-brand-teal" />
                </div>
                <h2 className="mb-2 text-[14px] font-semibold text-white">AI-driven design</h2>
                <p className="text-[13px] leading-relaxed text-white/70">
                  Berätta om ditt företag och få en skräddarsydd webbplats baserad på din bransch och målgrupp.
                </p>
              </div>

              {/* Gratis webbplatsanalys */}
              <div
                className="animate-fadeInUp group relative overflow-hidden rounded-2xl border border-white/6 bg-white/2 p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/10 hover:bg-white/4"
                style={{ animationDelay: "0.9s", animationFillMode: "forwards", opacity: 0 }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/4 to-transparent" />
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/10 transition-all duration-500 group-hover:bg-brand-blue/15">
                  <Search className="h-4.5 w-4.5 text-brand-blue" />
                </div>
                <h2 className="mb-2 text-[14px] font-semibold text-white">Gratis webbplatsanalys</h2>
                <p className="text-[13px] leading-relaxed text-white/70">
                  Analysera din befintliga sajt med AI och få en detaljerad rapport med förbättringsförslag.
                </p>
              </div>

              {/* Röst och video */}
              <div
                className="animate-fadeInUp group relative overflow-hidden rounded-2xl border border-white/6 bg-white/2 p-6 backdrop-blur-sm transition-all duration-500 hover:border-white/10 hover:bg-white/4"
                style={{ animationDelay: "1.0s", animationFillMode: "forwards", opacity: 0 }}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/4 to-transparent" />
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-amber/10 transition-all duration-500 group-hover:bg-brand-amber/15">
                  <Pencil className="h-4.5 w-4.5 text-brand-amber" />
                </div>
                <h2 className="mb-2 text-[14px] font-semibold text-white">Röst och video</h2>
                <p className="text-[13px] leading-relaxed text-white/70">
                  Beskriv din vision med rösten eller spela in en presentation — AI bygger utifrån det.
                </p>
              </div>
            </div>

            {/* Stats row with separators */}
            <div className="animate-fadeIn flex items-center justify-center" style={{ animationDelay: "1.1s", animationFillMode: "forwards", opacity: 0 }}>
              <div className="flex items-center divide-x divide-white/6">
                {[
                  { value: "5 sek", label: "Första utkast" },
                  { value: "100+", label: "Mallar" },
                  { value: "SEO", label: "Inbyggd audit" },
                  { value: "1-klick", label: "Publicering" },
                ].map((stat) => (
                  <div key={stat.label} className="px-6 text-center sm:px-8">
                    <p className="text-[15px] font-semibold text-white/80">{stat.value}</p>
                    <p className="mt-0.5 text-[10px] font-medium tracking-[0.12em] text-white/60 uppercase">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trusted by marquee */}
      <TrustedByMarquee />

      {/* Impact highlights */}
      <section className="relative z-10 px-4 py-16">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-10 text-center">
            <Badge className="mb-3 bg-white/10 text-white/70">Resultat</Badge>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Bygg snabbare utan att tumma på kvalitet
            </h2>
            <p className="mt-3 text-sm text-white/60">
              En kombination av shadcn/ui, smarta defaults och AI‑assistans gör skillnaden.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {impactStats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card
                  key={stat.label}
                  className="border-white/10 bg-white/4 text-white shadow-[0_0_40px_rgba(59,130,246,0.08)]"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8">
                          <Icon className={`h-4.5 w-4.5 ${stat.accent}`} />
                        </div>
                        <CardTitle className="text-base font-semibold text-white">
                          {stat.label}
                        </CardTitle>
                      </div>
                      <Badge className="bg-white/8 text-white/60">+{stat.value}%</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4 text-sm text-white/60">{stat.description}</p>
                    <Progress value={stat.value} className="h-2 bg-white/10" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Process timeline */}
      <section className="relative z-10 px-4 pb-16">
        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Badge className="mb-3 bg-white/10 text-white/70">Flöde</Badge>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">
              Ett tydligt flöde från idé till publicering
            </h2>
            <p className="mt-3 text-sm text-white/60">
              Varje steg ger dig tydlig feedback och konkreta nästa actions.
            </p>
            <div className="relative mt-8 space-y-5">
              <div className="absolute left-4 top-0 h-full w-px bg-linear-to-b from-white/20 via-white/10 to-transparent" />
              {processSteps.map((step, index) => (
                <div key={step.title} className="relative pl-14">
                  <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-white/70">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <Card className="border-white/10 bg-white/4 text-white">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-white/60">{step.description}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-linear-to-b from-white/6 via-white/3 to-transparent p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal/15">
                <Sparkles className="h-5 w-5 text-brand-teal" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Palett + AI</h3>
                <p className="text-xs text-white/60">Allt du behöver finns redan på plats.</p>
              </div>
            </div>
            <ul className="space-y-3 text-sm text-white/65">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
                Välj mall när du vill starta om snabbt.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" />
                Lägg till AI‑komponenter med färdiga prompts.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />
                shadcn/ui‑block med auto‑deps när det behövs.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 px-4 pb-20">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <Badge className="mb-3 bg-white/10 text-white/70">Case</Badge>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Teams som bygger snabbare med Sajtmaskin
              </h2>
            </div>
            <div className="hidden items-center gap-1 text-white/60 sm:flex">
              <Star className="h-4 w-4 text-brand-amber" />
              <span className="text-sm">4.9/5 i nöjdhet</span>
            </div>
          </div>
          <Carousel
            opts={{ align: "start", loop: true }}
            setApi={setTestimonialsApi}
            className="relative"
          >
            <CarouselContent>
              {testimonials.map((item) => (
                <CarouselItem key={item.name} className="md:basis-1/2 lg:basis-1/3">
                  <Card className="h-full border-white/10 bg-white/4 text-white">
                    <CardContent className="flex h-full flex-col gap-4">
                      <div className="flex items-center gap-1 text-brand-amber">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star key={idx} className="h-4 w-4" />
                        ))}
                      </div>
                      <p className="text-sm text-white/70">“{item.quote}”</p>
                      <div className="mt-auto">
                        <div className="text-sm font-semibold text-white">{item.name}</div>
                        <div className="text-xs text-white/50">{item.role}</div>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="-left-6 border-white/10 bg-white/5 text-white hover:bg-white/10" />
            <CarouselNext className="-right-6 border-white/10 bg-white/5 text-white hover:bg-white/10" />
          </Carousel>
        </div>
      </section>
    </main>
  );
}
