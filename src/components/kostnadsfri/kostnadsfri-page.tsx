"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PasswordGate } from "./password-gate";
import { MiniWizard } from "./mini-wizard";
import { ThinkingSpinner } from "./thinking-spinner";
import { FollowupStep } from "./followup-step";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import { buildPromptFromWizardData } from "@/lib/kostnadsfri";
import { buildKostnadsfriAgentBrief } from "@/lib/kostnadsfri/agent-brief";
import {
  persistBoundCampaignProjectId,
} from "@/lib/kostnadsfri/agent-campaign-script";
import {
  KOSTNADSFRI_FOLLOWUPS_READY_EVENT,
  createFollowupSession,
  selectKostnadsfriFollowups,
} from "@/lib/kostnadsfri/agent-followups";
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
 * 4. ThinkingSpinner + one init-build, then /builder
 *
 * The landing-page visit is recorded by the global AnalyticsTracker; the
 * password step by the verify route and the completed wizard by
 * `POST /api/prompts` (`kostnadsfriSlug`) — both server-side, so the admin
 * console's funnel cannot be inflated from the browser.
 */

type Phase = "password" | "wizard" | "followup" | "thinking" | "done";

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
  const [phase, setPhase] = useState<Phase>("password");
  const [companyData, setCompanyData] = useState<KostnadsfriCompanyData | null>(null);
  const [wizardData, setWizardData] = useState<MiniWizardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initStartedRef = useRef(false);
  const createdProjectIdRef = useRef<string | null>(null);
  const campaignScript = useOpenClawStore((state) => state.campaignScript);
  const activeCompanyName = companyData?.companyName ?? companyName;
  const activeOpenclawConfig = useMemo(
    () => companyData?.openclawConfig ?? openclawConfig ?? null,
    [companyData?.openclawConfig, openclawConfig],
  );

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

  const handlePasswordSuccess = useCallback((data: KostnadsfriCompanyData) => {
    setCompanyData(data);
    setPhase("wizard");
  }, []);

  const startInitBuild = useCallback(async () => {
    if (initStartedRef.current || !wizardData) return;
    initStartedRef.current = true;
    setPhase("thinking");
    setError(null);

    try {
      const answers =
        useOpenClawStore.getState().campaignScript?.followupSession?.answers ?? {};
      const prompt = buildPromptFromWizardData(wizardData, answers);

      let projectId = createdProjectIdRef.current;
      if (!projectId) {
        const project = await createProject(
          `${companyName} - Kostnadsfri`,
          "kostnadsfri",
          prompt.substring(0, 100),
        );
        projectId = project.id;
        createdProjectIdRef.current = project.id;
        persistBoundCampaignProjectId(project.id, { slug });
        useOpenClawStore.getState().bindCampaignProjectId(project.id);
      }

      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          source: "kostnadsfri",
          projectId,
          kostnadsfriSlug: slug,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create prompt");
      }

      const result = await response.json();
      const promptId = result.promptId;

      if (!promptId) {
        throw new Error("No promptId returned");
      }

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
      setError("Något gick fel. Försök igen.");
      initStartedRef.current = false;
      setPhase("followup");
    }
  }, [router, companyName, slug, wizardData]);

  const handleWizardComplete = useCallback((nextWizardData: MiniWizardData) => {
    setWizardData(nextWizardData);
    setError(null);
    setPhase("followup");
  }, []);

  useEffect(() => {
    if (phase !== "followup") return;
    const store = useOpenClawStore.getState();
    store.hydrateCampaignScript(slug);
    store.beginCampaignFollowups(selectKostnadsfriFollowups(agentBrief).map((item) => item.id));
  }, [phase, slug, agentBrief]);

  useEffect(() => {
    if (phase !== "followup") return;
    const onReady = () => {
      void startInitBuild();
    };
    window.addEventListener(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(KOSTNADSFRI_FOLLOWUPS_READY_EVENT, onReady);
    };
  }, [phase, startInitBuild]);

  const followupSession =
    campaignScript?.slug === slug
      ? campaignScript.followupSession
      : createFollowupSession(selectKostnadsfriFollowups(agentBrief).map((item) => item.id));

  return (
    <div className="min-h-screen bg-background">
      {phase === "password" && (
        <PasswordGate slug={slug} companyName={companyName} onSuccess={handlePasswordSuccess} />
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

      {(phase === "thinking" || phase === "done") && (
        <ThinkingSpinner companyName={companyData?.companyName || companyName} />
      )}
    </div>
  );
}
