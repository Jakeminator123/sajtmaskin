"use client";

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { CompanyLookupResult } from "@/app/api/wizard/company-lookup/route";
import type { Competitor } from "@/app/api/wizard/competitors/route";
import { isStaleWizardRunResponse } from "@/components/modals/prompt-wizard/use-wizard-run";

/**
 * V3 intelligence: automatic company lookup + competitor discovery,
 * plus location auto-fill from company info. Moved verbatim from the
 * prompt-wizard-modal-v2 monolith.
 */
export function useCompanyIntelligence({
  isOpen,
  isAuthenticated,
  isInitialized,
  wizardRunId,
  companyName,
  industry,
  location,
  locationLat,
  locationLng,
  existingWebsite,
  setLocation,
  onInvalidWizardRun,
}: {
  isOpen: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  wizardRunId: string;
  companyName: string;
  industry: string;
  location: string;
  locationLat: number | undefined;
  locationLng: number | undefined;
  existingWebsite: string;
  setLocation: Dispatch<SetStateAction<string>>;
  onInvalidWizardRun?: () => void;
}) {
  const [companyLookup, setCompanyLookup] = useState<CompanyLookupResult | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [marketInsight, setMarketInsight] = useState<string | null>(null);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(false);
  const companyLookupRef = useRef<string | null>(null);
  const competitorsRef = useRef<string | null>(null);

  // ── V3: Auto company lookup from companyName ──────────────────
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !isInitialized || !wizardRunId) return;
    const name = companyName.trim();
    const lookupKey = `${wizardRunId}:${name}`;
    if (name.length < 3 || companyLookupRef.current === lookupKey) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (companyLookupRef.current === lookupKey) return;
      companyLookupRef.current = lookupKey;
      setIsLookingUp(true);
      fetch("/api/wizard/company-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ wizardRunId, companyName: name }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as CompanyLookupResult;
          if (isStaleWizardRunResponse(response)) {
            onInvalidWizardRun?.();
            return;
          }
          if (data.found) setCompanyLookup(data);
        })
        .catch(() => {})
        .finally(() => setIsLookingUp(false));
    }, 1200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyName, isOpen, isAuthenticated, isInitialized, wizardRunId, onInvalidWizardRun]);

  // Auto-fill location from company lookup (only if user hasn't set one)
  useEffect(() => {
    if (!companyLookup?.city || location.trim()) return;
    setLocation(companyLookup.city);
  }, [companyLookup, location, setLocation]);

  // ── V3: Auto competitor discovery ─────────────────────────────
  useEffect(() => {
    if (!isOpen || !isAuthenticated || !isInitialized || !wizardRunId) return;
    if (!companyName.trim() || !industry) return;
    const key = `${wizardRunId}|${companyName.trim()}|${industry}|${location.trim()}|${locationLat?.toFixed(5) ?? ""}|${locationLng?.toFixed(5) ?? ""}`;
    if (competitorsRef.current === key) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (competitorsRef.current === key) return;
      competitorsRef.current = key;
      setIsLoadingCompetitors(true);
      fetch("/api/wizard/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          wizardRunId,
          companyName: companyName.trim(),
          industry,
          location: location.trim(),
          lat: locationLat,
          lng: locationLng,
          existingWebsite: existingWebsite.trim(),
        }),
      })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as {
            competitors?: Competitor[];
            marketInsight?: string;
          };
          if (isStaleWizardRunResponse(response)) {
            onInvalidWizardRun?.();
            return;
          }
          if (data.competitors?.length) setCompetitors(data.competitors);
          if (data.marketInsight) setMarketInsight(data.marketInsight);
        })
        .catch(() => {})
        .finally(() => setIsLoadingCompetitors(false));
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [companyName, industry, location, locationLat, locationLng, existingWebsite, isOpen, isAuthenticated, isInitialized, wizardRunId, onInvalidWizardRun]);

  return { companyLookup, isLookingUp, competitors, marketInsight, isLoadingCompetitors };
}
