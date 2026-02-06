"use client";

/**
 * Entry Params Hook
 * ═══════════════════════════════════════════════════════════════
 *
 * Handles URL-parameter-based entry into Sajtmaskin from external
 * sites (primarily sajtstudio.se). This module is intentionally
 * self-contained and separated from the main site logic.
 *
 * ENTRY FLOWS:
 *
 * 1. sajtstudio.se "Utvärdera din sajt" button:
 *    → sajtmaskin.vercel.app?mode=audit
 *    → Shows entry modal, then expands audit section
 *
 * 2. sajtstudio.se "Bygg din sajt nu" / landing page:
 *    → sajtmaskin.vercel.app (no params)
 *    → Normal landing, no special handling
 *
 * 3. sajtstudio.se/start (future — token-based):
 *    → sajtmaskin.vercel.app?token=demo-kzmpc9tk45vsovp4cme1
 *    → Token saved to sessionStorage for session linking
 *
 * TOKEN FORMAT:
 *   demo- + alphanumeric string (e.g. demo-kzmpc9tk45vsovp4cme1)
 *   Represents a specific customer-generated site in sajtstudio's
 *   SQLite database (previews.db).
 *
 * ARCHITECTURE:
 *   sajtstudio.se (Render)
 *     ├── /         → CTA buttons with ?mode=audit
 *     ├── /start    → Landing page → ?token=demo-xxx
 *     └── /api      → Analytics (SQLite)
 *   sajtmaskin.vercel.app (this repo)
 *     ├── /         → Reads ?mode / ?token on mount
 *     └── lib/entry → THIS MODULE (isolated entry logic)
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { EntryMode } from "@/components/modals";
import {
  saveEntryToken,
  type EntryToken,
} from "./entry-token";

// ── Types ───────────────────────────────────────────────────────

export interface EntryParams {
  /** Active entry mode that should show a modal first, or null */
  mode: EntryMode | null;
  /** Partner/referral name from ?ref=xxx */
  partner: string | null;
  /** Token from ?token=xxx (saved to sessionStorage) */
  token: EntryToken | null;
  /** Company name from ?company=xxx (for personalized welcome) */
  company: string | null;
  /**
   * Action to apply immediately on mount (no modal).
   * Some modes (e.g. audit) skip the modal and go straight
   * to the corresponding section.
   */
  directAction: EntryMode | null;
  /** True when company param is present — shows WelcomeOverlay before audit */
  showWelcome: boolean;
  /** Dismiss the welcome overlay */
  dismissWelcome: () => void;
  /** Dismiss the entry modal and activate the corresponding section */
  continueEntry: () => { action: "wizard" | "audit" | "freeform" } | null;
  /** Dismiss the entry modal without activating anything */
  dismissEntry: () => void;
}

// ── Constants ───────────────────────────────────────────────────

const VALID_ENTRY_MODES = new Set<string>(["audit", "wizard", "freeform", "analyserad"]);
const TOKEN_PATTERN = /^demo-[a-z0-9]+$/i;

/**
 * URL param aliases → internal EntryMode.
 * e.g. ?mode=analyserad maps to the "wizard" flow internally.
 */
const MODE_ALIASES: Record<string, EntryMode> = {
  analyserad: "wizard",
};

/** Modes that skip the entry modal and activate directly */
const DIRECT_MODES = new Set<EntryMode>(["audit", "wizard"]);

/** Abbreviations that should be fully uppercased in company names */
const UPPERCASE_WORDS = new Set(["ab", "hb", "kb", "ek", "ef", "ab"]);

/**
 * Convert a URL slug to a display name.
 * e.g. "alpha-rekrytering-ab" → "Alpha Rekrytering AB"
 */
function formatCompanySlug(slug: string): string {
  return slug
    .split("-")
    .map((word) =>
      UPPERCASE_WORDS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * Reads entry parameters (?mode, ?ref, ?token) from the URL on
 * mount, stores the token in sessionStorage, and cleans the URL.
 *
 * Returns controls for the entry modal (continue / dismiss).
 */
export function useEntryParams(): EntryParams {
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<EntryMode | null>(null);
  const [directAction, setDirectAction] = useState<EntryMode | null>(null);
  const [partner, setPartner] = useState<string | null>(null);
  const [token, setToken] = useState<EntryToken | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // ── Parse URL params on mount ──
  useEffect(() => {
    const rawMode = searchParams.get("mode");
    const rawRef = searchParams.get("ref");
    const rawToken = searchParams.get("token");
    const rawCompany = searchParams.get("company");

    let hasEntryParams = false;

    // Company name (e.g. ?company=alpha-rekrytering-ab → "Alpha Rekrytering AB")
    if (rawCompany) {
      const decoded = decodeURIComponent(rawCompany);
      // Format slug (hyphens → spaces, capitalize, AB/HB uppercase)
      setCompany(decoded.includes("-") ? formatCompanySlug(decoded) : decoded);
      hasEntryParams = true;
    }

    // Mode (e.g. ?mode=audit, ?mode=analyserad)
    if (rawMode && VALID_ENTRY_MODES.has(rawMode)) {
      // Resolve alias (e.g. "analyserad" → "wizard")
      const entryMode: EntryMode = MODE_ALIASES[rawMode] ?? (rawMode as EntryMode);

      if (rawCompany && DIRECT_MODES.has(entryMode)) {
        // Company + direct mode → show welcome overlay first, then activate
        setShowWelcome(true);
        setDirectAction(entryMode);
      } else if (DIRECT_MODES.has(entryMode)) {
        // Direct mode without company → activate immediately
        setDirectAction(entryMode);
      } else {
        // Other modes → show the entry modal first
        setMode(entryMode);
      }
      hasEntryParams = true;
    }

    // Partner/referral (e.g. ?ref=sajtstudio)
    if (rawRef) {
      setPartner(rawRef);
      hasEntryParams = true;
    }

    // Token (e.g. ?token=demo-kzmpc9tk45vsovp4cme1)
    if (rawToken && TOKEN_PATTERN.test(rawToken)) {
      setToken(rawToken);
      saveEntryToken(rawToken);
      hasEntryParams = true;
    }

    // Clean all entry params from URL without navigation
    if (hasEntryParams) {
      const url = new URL(window.location.href);
      url.searchParams.delete("mode");
      url.searchParams.delete("ref");
      url.searchParams.delete("token");
      url.searchParams.delete("company");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams]);

  // ── Actions ──

  const continueEntry = useCallback(() => {
    const currentMode = mode;
    setMode(null);
    setPartner(null);

    if (!currentMode) return null;

    return { action: currentMode } as const;
  }, [mode]);

  const dismissEntry = useCallback(() => {
    setMode(null);
    setPartner(null);
  }, []);

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
  }, []);

  return { mode, partner, token, company, directAction, showWelcome, dismissWelcome, continueEntry, dismissEntry };
}
