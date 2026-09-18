"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PasswordGate } from "./password-gate";
import { MiniWizard } from "./mini-wizard";
import { ThinkingSpinner } from "./thinking-spinner";
import { FollowupStep } from "./followup-step";
import { RequireAuthModal } from "@/components/auth/require-auth-modal";
import { useAuth } from "@/lib/auth/auth-store";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import {
  buildKostnadsfriWizardSnapshot,
  buildPromptFromWizardData,
  isKostnadsfriIndustryConflictError,
  kostnadsfriIndustryConflictFromResponse,
} from "@/lib/kostnadsfri";
import { buildKostnadsfriAgentBrief } from "@/lib/kostnadsfri/agent-brief";
import {
  persistBoundCampaignProjectId,
  reusableBoundCampaignProjectId,
} from "@/lib/kostnadsfri/agent-campaign-script";
import {
  KOSTNADSFRI_FOLLOWUPS_READY_EVENT,
  createFollowupSession,
  selectKostnadsfriFollowups,
} from "@/lib/kostnadsfri/agent-followups";
import {
  kostnadsfriAuthReturnPath,
} from "@/lib/kostnadsfri/auth-return";
import {
  clearPendingInitBuild,
  persistPendingInitBuild,
  readPendingInitBuild,
} from "@/lib/kostnadsfri/pending-init-build";
import type { KostnadsfriOpenClawConfig } from "@/lib/kostnadsfri/openclaw-config";
import { createProject } from "@/lib/projects/project-client";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

/**
 * KostnadsfriPage — Client component that orchestrates the full flow:
 * 1. PasswordGate (verify password -> get company data)
 * 2. MiniWizard (3-step wizard with pre-filled data)
 * 3. Follow-up wait (skip / answer / Fortsätt — no silent 3s build)
 * 4. Account (login/register) — answers persist across Google / e-post
 * 5. ThinkingSpinner + one init-build after a confirmed account, then /builder
 *
 * The landing-page visit is recorded by the global AnalyticsTracker; the
 * password step by the verify route and the completed wizard by
 * `POST /api/prompts` (`kostnadsfriSlug`) — both server-side, so the admin
 * console's funnel cannot be inflated from the browser.
 */

type Phase = "password" | "wizard" | "followup" | "auth" | "thinking" | "done";

interface KostnadsfriPageProps {
  slug: string;
  companyName: string;
  openclawConfig?: KostnadsfriOpenClawConfig | null;
}

export function KostnadsfriPage({
  slug,
  companyName,
  openclawConfig = null,
}: KostnadsfriPageProps) {
  const router = useRouter();
  const { isAuthenticated, isInitialized, fetchUser } = useAuth();
  const [phase, setPhase] = useState<Phase>("password");
  const [companyData, setCompanyData] = useState<KostnadsfriCompanyData | null>(null);
  // Sajtagentens underlag växer med flödet: bolagsdata efter lösenordet,
  // wizardens svar när de bekräftats. Sparas separat från prompten eftersom
  // prompten är en engångsartefakt medan underlaget lever kvar i samtalet.
  const [wizardData, setWizardData] = useState<MiniWizardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const initStartedRef = useRef(false);
  const createdProjectIdRef = useRef<string | null>(null);
  const campaignScript = useOpenClawStore((state) => state.campaignScript);
  const activeCompanyName = companyData?.companyName ?? wizardData?.companyName ?? companyName;
  const activeOpenclawConfig = useMemo(
    () => companyData?.openclawConfig ?? openclawConfig ?? null,
    [companyData?.openclawConfig, openclawConfig],
  );
  const authReturnTo = kostnadsfriAuthReturnPath(slug);

  // Underlaget speglar vad som är bestämt just nu, så Sajtagenten kan ställa en
  // riktad följdfråga i stället för en allmän. Allowlistat i `agent-brief.ts`.
  const agentBrief = useMemo(
    () =>
      buildKostnadsfriAgentBrief({
        stage: phase === "password" ? "gate" : phase === "wizard" ? "wizard" : "handoff",
        companyData,
        fallbackCompanyName: companyName,
        wizardData,
      }),
    [phase, companyData, companyName, wizardData],
  );

  useEffect(() => {
    window.__SITEMASKIN_CONTEXT = {
      page: "kostnadsfri",
      slug,
      companyName: activeCompanyName,
      kostnadsfriBrief: agentBrief,
      openclawSurface: {
        companyName: activeCompanyName,
        ...(activeOpenclawConfig ?? {}),
      },
    };
    window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));

    return () => {
      delete window.__SITEMASKIN_CONTEXT;
      window.dispatchEvent(new CustomEvent("sajtmaskin:context-updated"));
    };
  }, [slug, activeCompanyName, activeOpenclawConfig, agentBrief]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const pending = readPendingInitBuild(slug);
    if (pending && !wizardData) {
      setWizardData(pending.wizardData);
    }
    if (typeof window === "undefined") return;
    const verified = new URLSearchParams(window.location.search).get("verified");
    if (verified === "success") {
      setVerifiedNotice("E-postadressen är verifierad. Logga in för att bygga hemsidan.");
    }
  }, [slug, wizardData]);

  const handlePasswordSuccess = useCallback((data: KostnadsfriCompanyData) => {
    setCompanyData(data);
    setError(null);
    if (wizardData) {
      persistPendingInitBuild({
        slug,
        wizardData,
        followupAnswers: readPendingInitBuild(slug)?.followupAnswers ?? {},
        ready: false,
      });
      setPhase("followup");
      return;
    }
    setPhase("wizard");
  }, [slug, wizardData]);

  const persistReadyHandoff = useCallback(
    (nextWizardData: MiniWizardData) => {
      const answers =
        useOpenClawStore.getState().campaignScript?.followupSession?.answers ?? {};
      return persistPendingInitBuild({
        slug,
        wizardData: nextWizardData,
        followupAnswers: answers,
        ready: true,
      });
    },
    [slug],
  );

  const startInitBuild = useCallback(async () => {
    if (initStartedRef.current) return;
    const pending = readPendingInitBuild(slug);
    const activeWizard = pending?.wizardData ?? wizardData;
    if (!activeWizard) return;
    if (!isAuthenticated) {
      persistReadyHandoff(activeWizard);
      setPhase("auth");
      setAuthModalOpen(true);
      return;
    }
    initStartedRef.current = true;
    setPhase("thinking");
    setError(null);

    try {
      const answers =
        pending?.followupAnswers ??
        useOpenClawStore.getState().campaignScript?.followupSession?.answers ??
        {};
      const prompt = buildPromptFromWizardData(activeWizard, answers);
      const wizardSnapshot = buildKostnadsfriWizardSnapshot(activeWizard, answers);

      const bindProject = (projectId: string) => {
        createdProjectIdRef.current = projectId;
        persistBoundCampaignProjectId(projectId, { slug });
        if (useOpenClawStore.getState().campaignScript?.slug !== slug) {
          useOpenClawStore.getState().hydrateCampaignScript(slug);
        }
        useOpenClawStore.getState().bindCampaignProjectId(projectId);
      };

      const createOwnedProject = async () => {
        const project = await createProject(
          `${activeWizard.companyName || companyName} - Kostnadsfri`,
          "kostnadsfri",
          prompt.substring(0, 100),
        );
        bindProject(project.id);
        return project.id;
      };

      let reusedStoredProject = false;
      let projectId = createdProjectIdRef.current;
      if (!projectId) {
        const liveScript = useOpenClawStore.getState().campaignScript;
        projectId = reusableBoundCampaignProjectId(slug, liveScript);
        if (projectId) {
          reusedStoredProject = true;
          bindProject(projectId);
        } else {
          projectId = await createOwnedProject();
        }
      }

      const postHandoff = (id: string) =>
        fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            source: "kostnadsfri",
            projectId: id,
            kostnadsfriSlug: slug,
            wizardSnapshot,
          }),
        });

      let response = await postHandoff(projectId);
      if (response.status === 403 && reusedStoredProject) {
        createdProjectIdRef.current = null;
        projectId = await createOwnedProject();
        response = await postHandoff(projectId);
      }

      if (response.status === 401 || response.status === 403) {
        if (response.status === 401) {
          createdProjectIdRef.current = null;
        }
        throw new Error(
          response.status === 401
            ? "Logga in för att bygga hemsidan."
            : "Inbjudan kunde inte verifieras.",
        );
      }

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const conflict = kostnadsfriIndustryConflictFromResponse(
          body,
          activeWizard.industry || "unknown",
        );
        if (conflict) throw conflict;
        throw new Error("Failed to create prompt");
      }

      const result = await response.json();
      const promptId = result.promptId;

      if (!promptId) {
        throw new Error("No promptId returned");
      }

      clearPendingInitBuild(slug);
      setPhase("done");
      const params = new URLSearchParams({
        project: projectId,
        promptId,
        buildMethod: "kostnadsfri",
        buildIntent: "website",
      });
      router.push(`/builder?${params.toString()}`);
    } catch (err) {
      console.error("[Kostnadsfri] Failed to generate prompt:", err);
      if (isKostnadsfriIndustryConflictError(err)) {
        persistPendingInitBuild({
          slug,
          wizardData: activeWizard,
          followupAnswers:
            pending?.followupAnswers ??
            useOpenClawStore.getState().campaignScript?.followupSession?.answers ??
            {},
          ready: false,
        });
        setError(err.message);
        initStartedRef.current = false;
        setWizardData(activeWizard);
        setPhase("wizard");
        return;
      }
      const message = err instanceof Error ? err.message : "";
      setError(
        message === "Logga in för att bygga hemsidan." ||
          message === "Inbjudan kunde inte verifieras."
          ? message
          : "Något gick fel. Försök igen.",
      );
      initStartedRef.current = false;
      // MiniWizard remountas tom mot companyData bara om vi backar dit.
      // Efter frågesteget stannar vi i followup så Fortsätt kan återanvända
      // samma projekt; wizard-underlaget får inte rensas där.
      if (message === "Logga in för att bygga hemsidan.") {
        setPhase("auth");
        setAuthModalOpen(true);
        return;
      }
      if (message === "Inbjudan kunde inte verifieras.") {
        persistPendingInitBuild({
          slug,
          wizardData: activeWizard,
          followupAnswers:
            pending?.followupAnswers ??
            useOpenClawStore.getState().campaignScript?.followupSession?.answers ??
            {},
          ready: false,
        });
        setWizardData(activeWizard);
        setPhase("password");
        return;
      }
      if (!createdProjectIdRef.current) {
        setWizardData(activeWizard);
        setPhase("followup");
      } else {
        setPhase("followup");
      }
    }
  }, [router, companyName, slug, wizardData, isAuthenticated, persistReadyHandoff]);

  const handleWizardComplete = useCallback((nextWizardData: MiniWizardData) => {
    setWizardData(nextWizardData);
    setError(null);
    persistPendingInitBuild({ slug, wizardData: nextWizardData, ready: false });
    setPhase("followup");
  }, [slug]);

  const requestInitBuild = useCallback(() => {
    const activeWizard = readPendingInitBuild(slug)?.wizardData ?? wizardData;
    if (!activeWizard) return;
    persistReadyHandoff(activeWizard);
    if (!isAuthenticated) {
      setPhase("auth");
      setAuthModalOpen(true);
      return;
    }
    void startInitBuild();
  }, [isAuthenticated, persistReadyHandoff, slug, startInitBuild, wizardData]);

  useEffect(() => {
    if (phase !== "followup") return;
    const store = useOpenClawStore.getState();
    store.hydrateCampaignScript(slug);
    store.beginCampaignFollowups(selectKostnadsfriFollowups(agentBrief).map((item) => item.id));
  }, [phase, slug, agentBrief]);

  useEffect(() => {
    if (phase !== "followup") return;
    const onReady = () => {
      requestInitBuild();
    };
    window.addEventListener(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, onReady);
    };
  }, [phase, requestInitBuild]);

  useEffect(() => {
    const pending = readPendingInitBuild(slug);
    if (!pending) return;
    if (!wizardData) setWizardData(pending.wizardData);
    if (!pending.ready) return;
    // Skip the password gate after Google / e-post return so the user
    // does not re-enter the invitation while the session hydrates.
    if (phase === "password") {
      setPhase("auth");
    }
    if (!isInitialized) return;
    if (phase !== "password" && phase !== "auth") return;
    if (!isAuthenticated) {
      setPhase("auth");
      setAuthModalOpen(true);
      return;
    }
    if (initStartedRef.current) return;
    void startInitBuild();
  }, [isAuthenticated, isInitialized, phase, slug, startInitBuild, wizardData]);

  const followupSession =
    campaignScript?.slug === slug
      ? campaignScript.followupSession
      : createFollowupSession(selectKostnadsfriFollowups(agentBrief).map((item) => item.id));

  return (
    <div className="min-h-screen bg-background">
      {phase === "password" && (
        <>
          {error ? (
            <p role="alert" className="text-destructive mx-auto max-w-lg px-6 pt-6 text-sm">
              {error}
            </p>
          ) : null}
          <PasswordGate slug={slug} companyName={companyName} onSuccess={handlePasswordSuccess} />
        </>
      )}

      {phase === "wizard" && companyData && (
        <MiniWizard companyData={companyData} onComplete={handleWizardComplete} error={error} />
      )}

      {phase === "followup" && followupSession && (
        <FollowupStep
          session={followupSession}
          error={error}
          onAnswer={(text) => {
            useOpenClawStore.getState().recordCampaignFollowupReply(text);
          }}
          onSkipCurrent={() => {
            useOpenClawStore.getState().skipCurrentCampaignFollowup();
          }}
          onSkipAll={() => {
            useOpenClawStore.getState().skipCampaignFollowups();
          }}
          onContinue={() => {
            useOpenClawStore.getState().continueCampaignFollowups();
          }}
        />
      )}

      {phase === "auth" && (
        <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16 text-center">
          <h1 className="text-foreground text-2xl font-(--font-heading) tracking-tight">
            Ett konto behövs för att bygga hemsidan
          </h1>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            Era svar är sparade. Logga in eller skapa ett konto — första bygget och en
            ändringsrunda ingår i inbjudan.
          </p>
          {verifiedNotice ? (
            <p role="status" className="text-primary mt-4 text-sm">
              {verifiedNotice}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive mt-4 text-sm">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary-hover mt-8 h-11 rounded-xl px-4 font-medium"
            onClick={() => setAuthModalOpen(true)}
          >
            Logga in eller skapa konto
          </button>
        </div>
      )}

      {(phase === "thinking" || phase === "done") && (
        <ThinkingSpinner companyName={companyData?.companyName || companyName} />
      )}

      <RequireAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        reason="kostnadsfri"
        returnTo={authReturnTo}
      />
    </div>
  );
}
