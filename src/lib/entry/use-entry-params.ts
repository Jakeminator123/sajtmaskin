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
 *    → Expands audit section directly (with ?company=xxx shows welcome overlay first)
 *
 * 1b. sajtstudio.se with company slug:
 *    → sajtmaskin.vercel.app?mode=analyserad&company=alpha-rekrytering-ab
 *    → Welcome overlay ("Välkommen, Alpha Rekrytering AB") then wizard opens
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

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import type { EntryMode } from "@/components/modals/entry-modal";
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
const UPPERCASE_WORDS = new Set(["ab", "hb", "kb", "ek", "ef"]);

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

// ── Pure parser ──────────────────────────────────────────────────

function parseEntryFromSearchParams(searchParams: ReadonlyURLSearchParams) {
  const rawMode = searchParams.get("mode");
  const rawRef = searchParams.get("ref");
  const rawToken = searchParams.get("token");
  const rawCompany = searchParams.get("company");

  let mode: EntryMode | null = null;
  let directAction: EntryMode | null = null;
  let company: string | null = null;
  let showWelcome = false;

  if (rawCompany) {
    const decoded = decodeURIComponent(rawCompany);
    company = decoded.includes("-") ? formatCompanySlug(decoded) : decoded;
  }

  if (rawMode && VALID_ENTRY_MODES.has(rawMode)) {
    const entryMode: EntryMode = MODE_ALIASES[rawMode] ?? (rawMode as EntryMode);
    if (rawCompany && DIRECT_MODES.has(entryMode)) {
      showWelcome = true;
      directAction = entryMode;
    } else if (DIRECT_MODES.has(entryMode)) {
      directAction = entryMode;
    } else {
      mode = entryMode;
    }
  }

  return {
    mode,
    directAction,
    partner: rawRef,
    token: (rawToken && TOKEN_PATTERN.test(rawToken) ? rawToken : null) as EntryToken | null,
    company,
    showWelcome,
    hasEntryParams: !!(rawMode || rawRef || rawToken || rawCompany),
  };
}

// ── Hook ────────────────────────────────────────────────────────

/**
 * Reads entry parameters (?mode, ?ref, ?token) from the URL on
 * mount, stores the token in sessionStorage, and cleans the URL.
 *
 * Uses useMemo to derive values synchronously so directAction,
 * showWelcome etc. are correct on first render (no flash of
 * default state).
 *
 * Returns controls for the entry modal (continue / dismiss).
 */
export function useEntryParams(): EntryParams {
  const searchParams = useSearchParams();

  // Derive entry config synchronously — correct from first render
  const parsed = useMemo(
    () => parseEntryFromSearchParams(searchParams),
    [searchParams],
  );

  // Mutable dismiss flags for fields that callbacks can clear
  const [modeDismissed, setModeDismissed] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const mode = modeDismissed ? null : parsed.mode;
  const showWelcome = parsed.showWelcome && !welcomeDismissed;

  // ── Side effects: save token + clean URL (once) ──
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (cleanedRef.current || !parsed.hasEntryParams) return;
    cleanedRef.current = true;

    if (parsed.token) saveEntryToken(parsed.token);

    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    url.searchParams.delete("ref");
    url.searchParams.delete("token");
    url.searchParams.delete("company");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [parsed]);

  // ── Actions ──

  const continueEntry = useCallback(() => {
    const currentMode = mode;
    setModeDismissed(true);
    if (!currentMode) return null;
    return { action: currentMode } as const;
  }, [mode]);

  const dismissEntry = useCallback(() => {
    setModeDismissed(true);
  }, []);

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
  }, []);

  return {
    mode,
    partner: parsed.partner,
    token: parsed.token,
    company: parsed.company,
    directAction: parsed.directAction,
    showWelcome,
    dismissWelcome,
    continueEntry,
    dismissEntry,
  };
}
