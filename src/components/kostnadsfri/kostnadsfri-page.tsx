"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PasswordGate } from "./password-gate";
import { MiniWizard } from "./mini-wizard";
import { ThinkingSpinner } from "./thinking-spinner";
import type { KostnadsfriCompanyData, MiniWizardData } from "@/lib/kostnadsfri";
import { buildPromptFromWizardData } from "@/lib/kostnadsfri";
import type { KostnadsfriOpenClawConfig } from "@/lib/kostnadsfri/openclaw-config";
import { createProject } from "@/lib/project-client";

declare global {
  interface Window {
    __SITEMASKIN_CONTEXT?: Record<string, unknown>;
  }
}

/**
 * KostnadsfriPage — Client component that orchestrates the full flow:
 * 1. PasswordGate (verify password -> get company data)
 * 2. MiniWizard (3-step wizard with pre-filled data)
 * 3. ThinkingSpinner (animated loader while generating prompt)
 * 4. Redirect to /builder with promptId
 */

type Phase = "password" | "wizard" | "thinking" | "done";

interface KostnadsfriPageProps {
  slug: string;
  companyName: string;
  /** Whether a DB record exists for this slug (enriched data available) */
  hasDbRecord?: boolean;
  openclawConfig?: KostnadsfriOpenClawConfig | null;
}

export function KostnadsfriPage({
  slug,
  companyName,
  hasDbRecord: _hasDbRecord,
  openclawConfig = null,
}: KostnadsfriPageProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("password");
  const [companyData, setCompanyData] = useState<KostnadsfriCompanyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeCompanyName = companyData?.companyName ?? companyName;
  const activeOpenclawConfig = useMemo(
    () => companyData?.openclawConfig ?? openclawConfig ?? null,
    [companyData?.openclawConfig, openclawConfig],
  );

  useEffect(() => {
    window.__SITEMASKIN_CONTEXT = {
      page: "kostnadsfri",
      slug,
      companyName: activeCompanyName,
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
  }, [slug, activeCompanyName, activeOpenclawConfig]);

  // Phase 1 -> Phase 2: Password verified
  const handlePasswordSuccess = useCallback((data: KostnadsfriCompanyData) => {
    setCompanyData(data);
    setPhase("wizard");
  }, []);

  // Phase 2 -> Phase 3: Wizard completed
  const handleWizardComplete = useCallback(
    async (wizardData: MiniWizardData) => {
      setPhase("thinking");
      setError(null);

      try {
        // Build prompt from wizard data
        const prompt = buildPromptFromWizardData(wizardData);

        // Create app project first (same pattern as category page)
        const project = await createProject(
          `${companyName} - Kostnadsfri`,
          "kostnadsfri",
          prompt.substring(0, 100),
        );

        // Create prompt handoff with project reference
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            source: "kostnadsfri",
            projectId: project.id,
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

        // Small delay so the spinner animation feels intentional
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Navigate to builder with spec mode enabled for best quality
        setPhase("done");
        const params = new URLSearchParams({
          project: project.id,
          promptId,
          buildMethod: "kostnadsfri",
          buildIntent: "website",
          specMode: "true",
        });
        router.push(`/builder?${params.toString()}`);
      } catch (err) {
        console.error("[Kostnadsfri] Failed to generate prompt:", err);
        setError("Något gick fel. Försök igen.");
        setPhase("wizard");
      }
    },
    [router, companyName],
  );

  return (
    <div className="min-h-screen bg-black">
      {phase === "password" && (
        <PasswordGate
          slug={slug}
          companyName={companyName}
          onSuccess={handlePasswordSuccess}
        />
      )}

      {phase === "wizard" && companyData && (
        <MiniWizard
          companyData={companyData}
          onComplete={handleWizardComplete}
          error={error}
        />
      )}

      {(phase === "thinking" || phase === "done") && (
        <ThinkingSpinner companyName={companyData?.companyName || companyName} />
      )}
    </div>
  );
}
