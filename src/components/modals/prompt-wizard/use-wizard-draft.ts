"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  PREDEFINED_PALETTES,
  type ColorPalette,
} from "@/components/forms/color-palette-picker";

type CustomColors = { primary: string; secondary: string; accent: string } | null;

/**
 * Persist wizard state in localStorage (restore on first open + auto-save).
 * Moved verbatim from the prompt-wizard-modal-v2 monolith.
 */
export function useWizardDraft({
  isOpen,
  step,
  setStep,
  companyName,
  setCompanyName,
  industry,
  setIndustry,
  location,
  setLocation,
  locationLat,
  setLocationLat,
  locationLng,
  setLocationLng,
  existingWebsite,
  setExistingWebsite,
  purposes,
  setPurposes,
  targetAudience,
  setTargetAudience,
  usp,
  setUsp,
  siteFeedback,
  setSiteFeedback,
  inspirationSites,
  setInspirationSites,
  selectedVibe,
  setSelectedVibe,
  specialWishes,
  setSpecialWishes,
  selectedPalette,
  setSelectedPalette,
  customColors,
  setCustomColors,
  followUpAnswers,
  setFollowUpAnswers,
}: {
  isOpen: boolean;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  companyName: string;
  setCompanyName: Dispatch<SetStateAction<string>>;
  industry: string;
  setIndustry: Dispatch<SetStateAction<string>>;
  location: string;
  setLocation: Dispatch<SetStateAction<string>>;
  locationLat: number | undefined;
  setLocationLat: Dispatch<SetStateAction<number | undefined>>;
  locationLng: number | undefined;
  setLocationLng: Dispatch<SetStateAction<number | undefined>>;
  existingWebsite: string;
  setExistingWebsite: Dispatch<SetStateAction<string>>;
  purposes: string[];
  setPurposes: Dispatch<SetStateAction<string[]>>;
  targetAudience: string;
  setTargetAudience: Dispatch<SetStateAction<string>>;
  usp: string;
  setUsp: Dispatch<SetStateAction<string>>;
  siteFeedback: string;
  setSiteFeedback: Dispatch<SetStateAction<string>>;
  inspirationSites: string[];
  setInspirationSites: Dispatch<SetStateAction<string[]>>;
  selectedVibe: string;
  setSelectedVibe: Dispatch<SetStateAction<string>>;
  specialWishes: string;
  setSpecialWishes: Dispatch<SetStateAction<string>>;
  selectedPalette: ColorPalette | null;
  setSelectedPalette: Dispatch<SetStateAction<ColorPalette | null>>;
  customColors: CustomColors;
  setCustomColors: Dispatch<SetStateAction<CustomColors>>;
  followUpAnswers: Record<string, string>;
  setFollowUpAnswers: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  // ── Persist wizard state in localStorage ──────────────────────
  const STORAGE_KEY = "sajtmaskin_wizard_draft";

  // Restore saved draft on first open
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (!isOpen || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      // Only restore if draft is recent (< 7 days)
      if (draft._ts && Date.now() - draft._ts > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (draft.companyName) setCompanyName(draft.companyName);
      if (draft.industry) setIndustry(draft.industry);
      if (draft.location) setLocation(draft.location);
      if (typeof draft.locationLat === "number") setLocationLat(draft.locationLat);
      if (typeof draft.locationLng === "number") setLocationLng(draft.locationLng);
      if (draft.existingWebsite) setExistingWebsite(draft.existingWebsite);
      if (draft.purposes?.length) setPurposes(draft.purposes);
      if (draft.targetAudience) setTargetAudience(draft.targetAudience);
      if (draft.usp) setUsp(draft.usp);
      if (draft.siteFeedback) setSiteFeedback(draft.siteFeedback);
      if (Array.isArray(draft.inspirationSites) && draft.inspirationSites.length > 0) {
        setInspirationSites(draft.inspirationSites.slice(0, 3));
      }
      if (draft.selectedVibe) setSelectedVibe(draft.selectedVibe);
      if (draft.specialWishes) setSpecialWishes(draft.specialWishes);
      if (draft.customColors) setCustomColors(draft.customColors);
      if (draft.selectedPaletteName) {
        const savedPalette = PREDEFINED_PALETTES.find((p) => p.name === draft.selectedPaletteName);
        if (savedPalette) setSelectedPalette(savedPalette);
      }
      if (draft.followUpAnswers && typeof draft.followUpAnswers === "object") {
        setFollowUpAnswers(draft.followUpAnswers);
      }
      if (draft.step && draft.step > 1) setStep(draft.step);
    } catch {
      // ignore corrupt data
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-save draft whenever key fields change
  useEffect(() => {
    if (!isOpen) return;
    // Don't save empty state
    if (!companyName && !industry) return;
    const draft = {
      companyName, industry, location, locationLat, locationLng, existingWebsite,
      purposes, targetAudience, usp, siteFeedback,
      inspirationSites,
      selectedVibe, specialWishes, step,
      selectedPaletteName: selectedPalette?.name || null,
      customColors,
      followUpAnswers,
      _ts: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore (private browsing etc)
    }
  }, [
    isOpen, companyName, industry, location, locationLat, locationLng, existingWebsite,
    purposes, targetAudience, usp, siteFeedback,
    inspirationSites,
    selectedVibe, specialWishes, step,
    selectedPalette, customColors,
    followUpAnswers,
  ]);

  // Clear draft when wizard completes
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return { clearDraft };
}
