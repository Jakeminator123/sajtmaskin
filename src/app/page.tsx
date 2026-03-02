"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthModal } from "@/components/auth";
import { Navbar } from "@/components/landing-v2/navbar";
import { ChatArea } from "@/components/landing-v2/chat-area";
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
import { useAuth } from "@/lib/auth/auth-store";
import { TemplateGallery } from "@/components/templates";
import { SiteAuditSection } from "@/components/layout";
import {
  resolveBuildIntentForMethod,
  DEFAULT_BUILD_INTENT,
  type BuildIntent,
} from "@/lib/builder/build-intent";
import type { AuditResult } from "@/types/audit";
import toast from "react-hot-toast";
import { createProject } from "@/lib/project-client";

function RootLandingContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const { user, isAuthenticated, isInitialized, fetchUser } = useAuth();

  const [buildIntent] = useState<BuildIntent>(DEFAULT_BUILD_INTENT);

  const [selectedCategory, setSelectedCategory] = useState<string | null>("fritext");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const [showWizard, setShowWizard] = useState(false);

  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditedUrl, setAuditedUrl] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");
  const [auditSubmitSignal, setAuditSubmitSignal] = useState(0);

  const entry = useEntryParams();
  const { showOnboarding, handleComplete, handleSkip } = useOnboarding();

  useEffect(() => {
    fetchUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!entry.directAction || entry.showWelcome) return;
    if (entry.directAction === "audit") {
      setSelectedCategory("audit");
      setExpandedSection("audit");
    } else if (entry.directAction === "wizard") {
      setShowWizard(true);
    } else if (entry.directAction === "freeform") {
      setSelectedCategory("fritext");
    }
  }, [entry.directAction, entry.showWelcome]);

  useEffect(() => {
    const login = searchParams.get("login");
    const authError = searchParams.get("error");
    const verified = searchParams.get("verified");
    const reason = searchParams.get("reason");

    if (!login && !authError && !verified) return;

    if (login === "success") {
      toast.success("Inloggningen lyckades.");
    }

    if (authError) {
      toast.error(authError);
      setAuthMode("login");
      setShowAuthModal(true);
    }

    if (verified === "success") {
      toast.success("E-postadressen är verifierad. Logga in för att fortsätta.");
      setAuthMode("login");
      setShowAuthModal(true);
    } else if (verified === "error") {
      const verificationErrorMessage =
        reason === "missing_token"
          ? "Verifieringslänken saknar token."
          : reason === "invalid_or_expired"
            ? "Verifieringslänken är ogiltig eller har gått ut."
            : reason === "server_error"
              ? "Något gick fel vid e-postverifiering."
              : "Kunde inte verifiera e-postadressen.";
      toast.error(verificationErrorMessage);
      setAuthMode("login");
      setShowAuthModal(true);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("login");
    nextParams.delete("error");
    nextParams.delete("verified");
    nextParams.delete("reason");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  const firstName =
    user?.name?.split(" ")[0] || user?.email?.split("@")[0] || undefined;

  const handleLoginClick = useCallback(() => {
    setAuthMode("login");
    setShowAuthModal(true);
  }, []);

  const handleRegisterClick = useCallback(() => {
    setAuthMode("register");
    setShowAuthModal(true);
  }, []);

  const handleCategoryChange = useCallback(
    (id: string | null) => {
      if (id === "analyserad") {
        setShowWizard(true);
        setSelectedCategory(null);
        setExpandedSection(null);
        return;
      }

      setSelectedCategory(id);

      if (id === "kategori" || id === "mall") {
        setExpandedSection("category");
      } else if (id === "audit") {
        setExpandedSection("audit");
      } else {
        setExpandedSection(null);
      }
    },
    [],
  );

  const handleAuditComplete = useCallback((result: AuditResult, url: string) => {
    setAuditResult(result);
    setAuditedUrl(url);
    setShowAuditModal(true);
  }, []);

  const handleAuditSubmitFromHero = useCallback(() => {
    setAuditSubmitSignal((prev) => prev + 1);
  }, []);

  const handleBuildFromAudit = useCallback(
    async (prompt: string) => {
      setShowAuditModal(false);
      try {
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
          throw new Error(data?.error || "Kunde inte spara audit-prompten");
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
        console.error("[RootLanding] Audit handoff failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Kunde inte spara audit-prompten",
        );
      }
    },
    [buildIntent, router],
  );

  const handleWizardComplete = useCallback(
    async (wizardData: WizardData, expandedPrompt: string) => {
      setShowWizard(false);
      try {
        const project = await createProject(
          `Analyserad - ${new Date().toLocaleDateString("sv-SE")}`,
          "wizard",
          expandedPrompt.substring(0, 100),
        );

        if (wizardData.companyName) {
          fetch("/api/company-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.id,
              company_name: wizardData.companyName,
              industry: wizardData.industry,
              location: wizardData.location,
              existing_website: wizardData.existingWebsite,
              website_analysis: wizardData.websiteAnalysis,
              site_likes: wizardData.siteLikes,
              site_dislikes: wizardData.siteDislikes,
              site_feedback: wizardData.siteOtherFeedback,
              target_audience: wizardData.targetAudience,
              purposes: wizardData.purposes,
              special_wishes: wizardData.specialWishes,
              color_palette_name: wizardData.palette?.name,
              color_primary: wizardData.customColors?.primary || wizardData.palette?.primary,
              color_secondary: wizardData.customColors?.secondary || wizardData.palette?.secondary,
              color_accent: wizardData.customColors?.accent || wizardData.palette?.accent,
              industry_trends: wizardData.industryTrends,
              inspiration_sites: wizardData.inspirationSites,
              voice_transcript: wizardData.voiceTranscript,
            }),
          }).catch((err) => console.error("[RootLanding] Failed to save company profile:", err));
        }

        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: expandedPrompt,
            source: "wizard",
            projectId: project.id,
          }),
        });
        const data = (await response.json().catch(() => null)) as {
          success?: boolean;
          promptId?: string;
          error?: string;
        } | null;
        if (!response.ok || !data?.promptId) {
          throw new Error(data?.error || "Kunde inte spara prompten");
        }
        const intent = resolveBuildIntentForMethod("wizard", buildIntent);
        const params = new URLSearchParams();
        params.set("project", project.id);
        params.set("promptId", data.promptId);
        params.set("buildMethod", "wizard");
        params.set("buildIntent", intent);
        router.push(`/builder?${params.toString()}`);
      } catch (error) {
        console.error("[RootLanding] Wizard handoff failed:", error);
        toast.error(
          error instanceof Error ? error.message : "Kunde inte spara prompten",
        );
      }
    },
    [buildIntent, router],
  );

  const handleEntryContinue = useCallback(() => {
    const result = entry.continueEntry();
    if (!result) return;
    if (result.action === "wizard") {
      setShowWizard(true);
    } else if (result.action === "audit") {
      setSelectedCategory("audit");
      setExpandedSection("audit");
    } else if (result.action === "freeform") {
      setSelectedCategory("fritext");
    }
  }, [entry]);

  const renderExpandedContent = () => {
    if (expandedSection === "category") {
      return (
        <div className="w-full max-w-4xl animate-fade-up">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-primary/20 to-transparent" />
            <span className="text-xs font-medium text-primary tracking-widest uppercase flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Välj kategori
            </span>
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-primary/20 to-transparent" />
          </div>
          <TemplateGallery />
        </div>
      );
    }

    if (expandedSection === "audit") {
      return (
        <div className="w-full max-w-2xl animate-fade-up">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-primary/20 to-transparent" />
            <span className="text-xs font-medium text-primary tracking-widest uppercase flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Analysera webbplats
            </span>
            <div className="h-px flex-1 bg-linear-to-r from-transparent via-primary/20 to-transparent" />
          </div>
          <SiteAuditSection
            onAuditComplete={handleAuditComplete}
            onRequireAuth={handleLoginClick}
            url={auditUrl}
            onUrlChange={setAuditUrl}
            hideUrlInput
            externalSubmitSignal={auditSubmitSignal}
          />
        </div>
      );
    }

    return null;
  };

  const renderHeroPrefix = () => {
    if (!isInitialized || !isAuthenticated || !firstName) return null;
    return (
      <div className="animate-fade-up mb-4" style={{ animationDelay: "0.05s" }}>
        <div className="inline-flex items-center gap-3 rounded-full border border-primary/15 bg-primary/5 px-5 py-2 backdrop-blur-xl">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {firstName[0]?.toUpperCase()}
          </div>
          <span className="text-sm text-muted-foreground">
            Välkommen,{" "}
            <span className="font-medium text-foreground">{firstName}</span>
          </span>
          <div className="h-3.5 w-px bg-border/30" />
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-primary">
              {user?.diamonds ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">credits</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
        <Navbar
          onLoginClick={handleLoginClick}
          onRegisterClick={handleRegisterClick}
        />
        <ChatArea
          selectedCategory={selectedCategory}
          onSelectedCategoryChange={handleCategoryChange}
          expandedContent={renderExpandedContent()}
          heroPrefix={renderHeroPrefix()}
          auditUrl={auditUrl}
          onAuditUrlChange={setAuditUrl}
          onAuditSubmit={handleAuditSubmitFromHero}
        />
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultMode={authMode}
      />

      <PromptWizardModalV2
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
        initialPrompt=""
        initialCompanyName={entry.company ?? ""}
        categoryType="website"
        buildIntent={buildIntent}
      />

      <AuditModal
        result={auditResult}
        auditedUrl={auditedUrl}
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        onBuildFromAudit={handleBuildFromAudit}
      />

      {entry.mode && (
        <EntryModal
          mode={entry.mode}
          partner={entry.partner}
          onContinue={handleEntryContinue}
          onClose={entry.dismissEntry}
        />
      )}

      {entry.showWelcome && entry.company && (
        <WelcomeOverlay
          company={entry.company}
          onContinue={() => entry.dismissWelcome()}
        />
      )}

      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <RootLandingContent />
    </Suspense>
  );
}
