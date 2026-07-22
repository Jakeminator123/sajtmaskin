"use client";

import { AuditPdfReport } from "@/components/audit/AuditPdfReport";
import BudgetEstimate from "@/components/audit/BudgetEstimate";
import ImprovementsList from "@/components/audit/ImprovementsList";
import MetricsChart from "@/components/audit/MetricsChart";
import SecurityReport from "@/components/audit/SecurityReport";
import type { AuditResult } from "@/types/audit";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Hammer,
  Loader2,
  Save,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface AuditModalProps {
  result: AuditResult | null;
  auditedUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBuildFromAudit?: (prompt: string) => void;
  /**
   * True when the audit is opened from an already-persisted source (e.g. the
   * /audits list). Starts the modal in the "Sparad" state so re-opening a saved
   * audit does not expose an active "Spara" action that POSTs a duplicate row.
   */
  alreadySaved?: boolean;
}

type TabId = "overview" | "improvements" | "technical" | "business";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: "overview", label: "Översikt", icon: "📊" },
  { id: "improvements", label: "Förbättringar", icon: "✨" },
  { id: "technical", label: "Teknisk", icon: "⚙️" },
  { id: "business", label: "Budget", icon: "💰" },
];

function sanitizeDisplayText(value?: string): string {
  if (!value) return "";
  let cleaned = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function renderTextList(items?: string[]) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-muted-foreground/70">–</p>;
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-foreground/90">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{sanitizeDisplayText(item)}</li>
      ))}
    </ul>
  );
}

export function AuditModal({
  result,
  auditedUrl,
  isOpen,
  onClose,
  onBuildFromAudit,
  alreadySaved,
}: AuditModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  const [showBuildOverlay, setShowBuildOverlay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(Boolean(alreadySaved));
  const [saveError, setSaveError] = useState<string | null>(null);
  // a11y: the dialog surface (focus trap target) + the element that had focus
  // before the modal opened, so focus can be returned to the trigger on close.
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset state when modal opens with new result. An already-persisted audit
  // (opened from /audits) starts as "Sparad" so it cannot POST a duplicate row.
  useEffect(() => {
    if (isOpen && result) {
      setActiveTab("overview");
      setIsSaved(Boolean(alreadySaved));
      setSaveError(null);
      setShowBuildConfirm(false);
    }
  }, [isOpen, result, alreadySaved]);

  // Auto-offer build overlay when audit opens
  useEffect(() => {
    if (isOpen && result && onBuildFromAudit) {
      setShowBuildOverlay(true);
    } else {
      setShowBuildOverlay(false);
    }
  }, [isOpen, result, onBuildFromAudit]);

  // Save audit to user's storage
  const handleSaveAudit = useCallback(async () => {
    if (!result || isSaving || isSaved) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const canonicalAuditUrl =
        (typeof auditedUrl === "string" && auditedUrl.trim()) ||
        (result.domain ? `https://${result.domain}` : "");
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: canonicalAuditUrl,
          domain: result.domain || "unknown",
          auditResult: result,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Kunde inte spara audit");
      }

      setIsSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Ett fel uppstod");
    } finally {
      setIsSaving(false);
    }
  }, [auditedUrl, result, isSaving, isSaved]);

  // Build a super prompt from the audit to kick off generation
  const buildSuperPrompt = useCallback(() => {
    if (!result) return "";

    const lines: string[] = [];
    lines.push("=== BYGG NY SAJT BASERAD PÅ AUDIT ===");

    if (auditedUrl) {
      lines.push(`Referenssida: ${auditedUrl}`);
      lines.push(
        "Behåll varumärkeskänslan (färger, logoplacering, tonalitet) men åtgärda alla brister och förbättra UX, prestanda och tillgänglighet.",
      );
    }

    if (result.company) lines.push(`Företag: ${result.company}`);
    if (result.domain) lines.push(`Domän: ${result.domain}`);

    if (result.audit_scores) {
      lines.push("");
      lines.push("Audit-poäng att lyfta:");
      const scores = result.audit_scores;
      if (scores.overall) lines.push(`- Övergripande: ${scores.overall}/100`);
      if (scores.seo) lines.push(`- SEO: ${scores.seo}/100`);
      if (scores.performance) lines.push(`- Prestanda: ${scores.performance}/100`);
      if (scores.ux) lines.push(`- UX: ${scores.ux}/100`);
      if (scores.accessibility) lines.push(`- Tillgänglighet: ${scores.accessibility}/100`);
      if (scores.security) lines.push(`- Säkerhet: ${scores.security}/100`);
      if (scores.mobile) lines.push(`- Mobil: ${scores.mobile}/100`);
      if (scores.content) lines.push(`- Innehåll: ${scores.content}/100`);
      if (scores.technical_seo) lines.push(`- Teknisk SEO: ${scores.technical_seo}/100`);
    }

    if (result.issues && result.issues.length > 0) {
      lines.push("");
      lines.push("Problem att lösa omedelbart:");
      result.issues.slice(0, 6).forEach((issue) => {
        lines.push(`- ${issue}`);
      });
    }

    if (result.improvements && result.improvements.length > 0) {
      lines.push("");
      lines.push("Förbättringar att implementera:");
      result.improvements.slice(0, 6).forEach((imp) => {
        const contextParts = [];
        if (imp.impact) contextParts.push(`impact: ${imp.impact}`);
        if (imp.effort) contextParts.push(`effort: ${imp.effort}`);
        if (imp.why) contextParts.push(imp.why);
        lines.push(`- ${imp.item}${contextParts.length ? ` (${contextParts.join("; ")})` : ""}`);
      });
    }

    if (result.strengths && result.strengths.length > 0) {
      lines.push("");
      lines.push("Styrkor att behålla:");
      result.strengths.slice(0, 5).forEach((strength) => {
        lines.push(`- ${strength}`);
      });
    }

    if (result.design_direction) {
      lines.push("");
      lines.push("Design & identitet:");
      if (result.design_direction.style) lines.push(`- Stil: ${result.design_direction.style}`);
      if (result.design_direction.color_psychology)
        lines.push(`- Färgpsykologi: ${result.design_direction.color_psychology}`);
      if (result.design_direction.ui_patterns)
        lines.push(`- UI-mönster: ${result.design_direction.ui_patterns.join(", ")}`);
      if (result.design_direction.accessibility_level)
        lines.push(`- Tillgänglighet: ${result.design_direction.accessibility_level}`);
    }

    if (result.target_audience_analysis) {
      lines.push("");
      lines.push("Målgrupp & beteende:");
      if (result.target_audience_analysis.demographics)
        lines.push(`- Demografi: ${result.target_audience_analysis.demographics}`);
      if (result.target_audience_analysis.pain_points)
        lines.push(`- Smärtpunkter: ${result.target_audience_analysis.pain_points}`);
      if (result.target_audience_analysis.expectations)
        lines.push(`- Förväntningar: ${result.target_audience_analysis.expectations}`);
    }

    if (result.content_strategy?.key_pages && result.content_strategy.key_pages.length > 0) {
      lines.push("");
      lines.push("Nyckelsidor som ska ingå:");
      result.content_strategy.key_pages.slice(0, 8).forEach((page) => {
        lines.push(`- ${page}`);
      });
    }

    if (result.expected_outcomes && result.expected_outcomes.length > 0) {
      lines.push("");
      lines.push("Mål/effekter att nå:");
      result.expected_outcomes.slice(0, 5).forEach((outcome) => {
        lines.push(`- ${outcome}`);
      });
    }

    if (result.priority_matrix?.quick_wins && result.priority_matrix.quick_wins.length > 0) {
      lines.push("");
      lines.push("Snabba vinster som ska komma tidigt på sidan:");
      result.priority_matrix.quick_wins.slice(0, 4).forEach((win) => {
        lines.push(`- ${win}`);
      });
    }

    if (result.security_analysis) {
      lines.push("");
      lines.push("Säkerhet (baka in i copy och implementation):");
      lines.push(`- HTTPS: ${result.security_analysis.https_status}`);
      lines.push(`- Headers: ${result.security_analysis.headers_analysis}`);
      lines.push(`- Cookies/GDPR: ${result.security_analysis.cookie_policy}`);
      if (
        result.security_analysis.vulnerabilities &&
        result.security_analysis.vulnerabilities.length > 0
      ) {
        lines.push(`- Potentiella risker: ${result.security_analysis.vulnerabilities.join(", ")}`);
      }
    }

    if (result.technical_recommendations && result.technical_recommendations.length > 0) {
      lines.push("");
      lines.push("Tekniska rekommendationer att omsätta:");
      result.technical_recommendations.slice(0, 4).forEach((rec) => {
        lines.push(`- ${rec.area}: ${rec.recommendation} (nuläge: ${rec.current_state})`);
      });
    }

    lines.push("");
    lines.push("Struktur att bygga (anpassa efter innehåll):");
    lines.push("- Navigering med logoplatshållare, sektion-ankare, CTA-knapp.");
    lines.push(
      "- Hero med tydlig huvudtitel, underrad, primär CTA, sekundär CTA samt visuell bakgrund (bild/gradient) och kort trust-rad.",
    );
    lines.push(
      "- Sektioner för erbjudanden/tjänster, USP-lista, case/portfolio eller testimonials, ett CTA-block mitt på sidan.",
    );
    lines.push(
      "- Sektion för innehåll/nyheter eller resurser om relevant, samt FAQ och tydligt kontaktblock med formulär + kontaktuppgifter.",
    );
    lines.push("- Footer med länkar, sociala ikoner och kontaktinformation.");

    lines.push("");
    lines.push("Design & kvalitet:");
    lines.push("- Använd färger/typo inspirerat av referenssidan.");
    lines.push("- Responsivt (mobil först), WCAG AA, hög läsbarhet.");
    lines.push("- Optimera bilder (komprimerade) och undvik tunga effekter.");

    lines.push("");
    lines.push(
      "Språk & ton: Svenska, konkret, säljdrivande men trovärdigt. Anpassa copy till målgruppen.",
    );
    lines.push(
      "Leverera en klar, konverterande layout som kan genereras i buildern utan ytterligare frågor.",
    );

    return lines.join("\n");
  }, [result, auditedUrl]);

  const launchBuildFromAudit = useCallback(() => {
    if (!result || !onBuildFromAudit) return;
    const prompt = buildSuperPrompt();
    if (!prompt.trim()) return;
    onBuildFromAudit(prompt);
    setShowBuildOverlay(false);
    onClose();
  }, [buildSuperPrompt, onBuildFromAudit, onClose, result]);

  // Esc-to-close + a focus trap so keyboard focus stays inside the dialog while
  // it is open (Tab/Shift+Tab cycle through the visible focusable elements).
  useEffect(() => {
    if (!isOpen) return;
    // Cycle Tab/Shift+Tab through the visible focusables of `container` so
    // keyboard focus stays within the topmost dialog surface.
    const trapTabWithin = (container: HTMLElement, e: KeyboardEvent) => {
        // Only visible focusables — inactive tab panels are display:none.
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || active === container || !container.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus();
        }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nested dialogs (PDF report / build confirmation) render outside
      // dialogRef. While one is stacked on top, Escape dismisses the topmost
      // dialog and the Tab trap retargets to it, so keyboard focus can neither
      // get stuck in nor slip down to the underlying audit surface.
      if (showPdfModal || showBuildConfirm) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (showBuildConfirm) setShowBuildConfirm(false);
          else setShowPdfModal(false);
          return;
        }
        if (e.key === "Tab") {
          const nested = document.querySelector<HTMLElement>("[data-audit-nested-dialog]");
          if (nested) trapTabWithin(nested, e);
        }
        return;
      }
      if (e.key === "Escape") {
        // Don't close if user is typing in an input field
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        if (isInput || target.isContentEditable) return;

        e.preventDefault();
        e.stopPropagation();
        // The auto-shown build-CTA overlay stacks inside the dialog — Escape
        // dismisses it first; a second Escape closes the audit itself.
        if (showBuildOverlay) {
          setShowBuildOverlay(false);
          return;
        }
        onClose();
        return;
      }
      if (e.key === "Tab") {
        // While the build-CTA overlay covers the dialog, confine Tab to it so
        // focus cannot reach the covered audit controls underneath.
        const container =
          (showBuildOverlay
            ? document.querySelector<HTMLElement>("[data-audit-build-overlay]")
            : null) ?? dialogRef.current;
        if (!container) return;
        trapTabWithin(container, e);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose, showPdfModal, showBuildConfirm, showBuildOverlay]);

  // Move focus into the dialog on open and return it to the trigger on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    const raf = requestAnimationFrame(() => {
      // When the build-CTA overlay auto-opens on top, it is the active prompt
      // — send initial focus there instead of the covered dialog surface.
      const buildOverlay = document.querySelector<HTMLElement>("[data-audit-build-overlay]");
      (buildOverlay ?? dialogRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      const trigger = previouslyFocusedRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    };
  }, [isOpen]);

  const downloadJSON = useCallback(() => {
    if (!result) return;

    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${result.domain || "result"}-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [result]);

  const navigateTab = (direction: "prev" | "next") => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (direction === "prev" && currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
    } else if (direction === "next" && currentIndex < tabs.length - 1) {
      setActiveTab(tabs[currentIndex + 1].id);
    }
  };

  if (!result) return null;

  const scrape = result.scrape_summary;
  const faviconUrl = result.domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.domain)}&sz=64`
    : null;

  const wordCountLabel = scrape
    ? scrape.word_count_source === "ai_estimate"
      ? `${scrape.aggregated_word_count} ord (AI-estimerat)`
      : `${scrape.aggregated_word_count} ord`
    : "";
  const scrapeLine = scrape
    ? `Scrape: ${scrape.pages_sampled} sida(or), ${wordCountLabel}${
        scrape.is_js_rendered ? " • JS-renderad" : ""
      }${
        typeof scrape.web_search_calls === "number"
          ? ` • Web search: ${scrape.web_search_calls}`
          : ""
      }`
    : null;

  const hasScores = result.audit_scores && Object.keys(result.audit_scores).length > 0;
  const hasImprovements = result.improvements && result.improvements.length > 0;
  const hasSecurity = result.security_analysis;
  const hasBudget = result.budget_estimate;
  const hasBusinessProfile = result.business_profile;
  const hasMarketContext = result.market_context;
  const hasCustomerSegments = result.customer_segments;
  const hasCompetitiveLandscape = result.competitive_landscape;
  const isAdvancedMode = result.audit_mode === "advanced";
  const hasAdvancedBusiness =
    isAdvancedMode &&
    (hasBusinessProfile || hasMarketContext || hasCustomerSegments || hasCompetitiveLandscape);
  const modeLabel = isAdvancedMode ? "Avancerad" : "Vanlig";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="audit-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-modal-title"
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-4">
                <div>
                  <h2 id="audit-modal-title" className="text-xl font-bold text-foreground">
                    Analysresultat
                  </h2>
                  <div className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-foreground/90">
                      {modeLabel} analys
                    </span>
                  </div>
                  {result.domain && (
                    <a
                      href={`https://${result.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-teal hover:text-brand-teal/80 flex items-center gap-1 text-sm"
                    >
                      {faviconUrl && (
                        <Image
                          src={faviconUrl}
                          alt=""
                          width={16}
                          height={16}
                          className="inline-block"
                          unoptimized
                        />
                      )}
                      {result.domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {scrapeLine && <div className="mt-1 text-[11px] text-muted-foreground/70">{scrapeLine}</div>}
                </div>
                {result.company && (
                  <span className="rounded-md bg-secondary px-3 py-1 text-sm text-foreground/90">
                    {result.company}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Secondary actions — grouped into one tight, lower-emphasis
                    cluster so the primary "Bygg förbättrad sida" CTA stands out. */}
                <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-secondary/30 p-0.5">
                  {/* Save to account */}
                  <button
                    onClick={handleSaveAudit}
                    disabled={isSaving || isSaved}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isSaved
                        ? "cursor-default bg-green-600/20 text-green-400"
                        : "text-foreground/80 hover:bg-secondary hover:text-foreground"
                    }`}
                    title={isSaved ? "Sparad i ditt konto" : "Spara till ditt konto"}
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isSaved ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaved ? "Sparad" : "Spara"}
                  </button>

                  {/* PDF Report */}
                  <button
                    onClick={() => setShowPdfModal(true)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Ladda ner som PDF"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </button>

                  {/* JSON Download */}
                  <button
                    onClick={downloadJSON}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
                    title="Ladda ner rådata som JSON"
                  >
                    <Download className="h-4 w-4" />
                    JSON
                  </button>
                </div>

                {/* Build from Audit - Primary CTA */}
                {onBuildFromAudit && (
                  <button
                    onClick={() => {
                      setShowBuildOverlay(false);
                      setShowBuildConfirm(true);
                    }}
                    className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 shadow-brand-warm/25 hover:shadow-brand-warm/40 flex items-center gap-2 rounded-xl bg-linear-to-r px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all"
                    title="Skapa en ny sida baserad på denna analys"
                  >
                    <Hammer className="h-4 w-4" />
                    Bygg förbättrad sida
                  </button>
                )}

                <button
                  onClick={onClose}
                  aria-label="Stäng"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="flex min-h-0 flex-1 flex-col gap-0">
            {/* Tabs */}
            <div className="flex shrink-0 items-center border-b border-border">
              <button
                onClick={() => navigateTab("prev")}
                disabled={activeTab === tabs[0].id}
                aria-label="Föregående flik"
                className="p-3 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <TabsList className="flex h-auto flex-1 overflow-x-auto rounded-none bg-transparent p-0">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex flex-1 items-center justify-center gap-2 rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium whitespace-nowrap shadow-none transition-colors data-[state=active]:border-brand-teal data-[state=active]:bg-brand-teal/10 data-[state=active]:text-brand-teal data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-secondary/50 data-[state=inactive]:hover:text-foreground"
                  >
                    <span>{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <button
                onClick={() => navigateTab("next")}
                disabled={activeTab === tabs[tabs.length - 1].id}
                aria-label="Nästa flik"
                className="p-3 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Overview Tab */}
                <TabsContent value="overview" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasScores && result.audit_scores && (
                      <MetricsChart scores={result.audit_scores as { [key: string]: number }} />
                    )}

                    {/* Strengths & Issues Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-green-400">
                            <span>✅</span> Styrkor
                          </h3>
                          <ul className="space-y-2">
                            {result.strengths.slice(0, 5).map((strength, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                                <span className="mt-0.5 text-green-400">•</span>
                                <span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.issues && result.issues.length > 0 && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-red-400">
                            <span>⚠️</span> Problem
                          </h3>
                          <ul className="space-y-2">
                            {result.issues.slice(0, 5).map((issue, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
                                <span className="mt-0.5 text-red-400">•</span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Expected Outcomes */}
                    {result.expected_outcomes && result.expected_outcomes.length > 0 && (
                      <div className="rounded-xl border border-border bg-secondary/30 p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
                          <span>🎯</span> Förväntade resultat
                        </h3>
                        <ul className="grid gap-2 md:grid-cols-2">
                          {result.expected_outcomes.map((outcome, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 rounded-lg bg-secondary/30 p-2 text-sm text-foreground/90"
                            >
                              <span className="text-brand-teal">📈</span>
                              <span>{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Improvements Tab */}
                <TabsContent value="improvements" forceMount className="data-[state=inactive]:hidden">
                    {hasImprovements && result.improvements ? (
                      <ImprovementsList improvements={result.improvements} />
                    ) : (
                      <EmptyState
                        icon="✨"
                        title="Inga förbättringar"
                        description="Analysen genererade inga specifika förbättringsförslag."
                      />
                    )}
                </TabsContent>

                {/* Technical Tab */}
                <TabsContent value="technical" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasSecurity && result.security_analysis && (
                      <SecurityReport securityAnalysis={result.security_analysis} />
                    )}

                    {/* Technical Recommendations */}
                    {result.technical_recommendations &&
                      result.technical_recommendations.length > 0 && (
                        <div className="rounded-xl border border-border bg-secondary/40 p-6">
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-foreground">
                            <span className="text-brand-teal">⚙️</span> Tekniska rekommendationer
                          </h3>
                          <div className="space-y-4">
                            {result.technical_recommendations.map((rec, i) => (
                              <div key={i} className="rounded-lg border border-border bg-secondary/30 p-4">
                                <h4 className="text-brand-teal mb-2 font-medium">{rec.area}</h4>
                                <p className="mb-2 text-sm text-muted-foreground">
                                  <span className="text-muted-foreground/70">Nuläge:</span> {rec.current_state}
                                </p>
                                <p className="text-sm text-foreground/90">
                                  <span className="text-muted-foreground/70">Rekommendation:</span>{" "}
                                  {rec.recommendation}
                                </p>
                                {rec.implementation && (
                                  <pre className="mt-2 overflow-x-auto rounded-lg bg-card p-2 text-xs text-muted-foreground">
                                    {rec.implementation}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {!hasSecurity &&
                      (!result.technical_recommendations ||
                        result.technical_recommendations.length === 0) && (
                        <EmptyState
                          icon="⚙️"
                          title="Ingen teknisk data"
                          description="Analysen genererade inga tekniska detaljer."
                        />
                      )}
                  </div>
                </TabsContent>

                {/* Business/Budget Tab */}
                <TabsContent value="business" forceMount className="data-[state=inactive]:hidden">
                  <div className="space-y-6">
                    {hasBudget && result.budget_estimate && (
                      <BudgetEstimate budget={result.budget_estimate} />
                    )}

                    {/* Competitor Insights */}
                    {result.competitor_insights && (
                      <div className="rounded-xl border border-border bg-secondary/40 p-6">
                        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-foreground">
                          <span className="text-brand-teal">🏆</span> Konkurrentanalys
                        </h3>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Branschstandard
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.industry_standards)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Saknade funktioner
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.missing_features)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-border bg-secondary/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                              Unika styrkor
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                              {sanitizeDisplayText(result.competitor_insights.unique_strengths)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasAdvancedBusiness && (
                      <div className="space-y-5 rounded-xl border border-border bg-secondary/40 p-6">
                        <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-foreground">
                          <span className="text-brand-blue">🧭</span> Affärs- & marknadsprofil
                        </h3>

                        {hasBusinessProfile && result.business_profile && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">Företagsprofil</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Bransch</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.industry)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Företagsstorlek</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.company_size)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Affärsmodell</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.business_model)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Mognadsgrad</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.business_profile.maturity)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Kärnerbjudanden</p>
                                {renderTextList(result.business_profile.core_offers)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Intäktsströmmar</p>
                                {renderTextList(result.business_profile.revenue_streams)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasMarketContext && result.market_context && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">
                              Marknad & geografi
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Primär geografi</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.primary_geography)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Serviceområde</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.service_area)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Konkurrensnivå</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.competition_level)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Nyckelkonkurrenter</p>
                                {renderTextList(result.market_context.key_competitors)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Säsongsmönster</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.seasonal_patterns)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">
                                  Lokala marknadsdynamiker
                                </p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.market_context.local_market_dynamics)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCustomerSegments && result.customer_segments && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">Kundsegment</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Primär kundgrupp</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.customer_segments.primary_segment)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Sekundära kundgrupper</p>
                                {renderTextList(result.customer_segments.secondary_segments)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Kundbehov</p>
                                {renderTextList(result.customer_segments.customer_needs)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Beslutstriggers</p>
                                {renderTextList(result.customer_segments.decision_triggers)}
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-muted-foreground">Förtroendesignaler</p>
                                {renderTextList(result.customer_segments.trust_signals)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCompetitiveLandscape && result.competitive_landscape && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-foreground/90">
                              Konkurrenslandskap
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Positionering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(result.competitive_landscape.positioning)}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Differentiering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.differentiation,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Prisposition</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.price_positioning,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                                <p className="mb-1 text-xs text-muted-foreground">Inträdesbarriärer</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-foreground/90">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.barriers_to_entry,
                                  )}
                                </p>
                              </div>
                              <div className="rounded-lg border border-border bg-secondary/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-muted-foreground">Möjligheter</p>
                                {renderTextList(result.competitive_landscape.opportunities)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!hasBudget && !result.competitor_insights && !hasAdvancedBusiness && (
                      <EmptyState
                        icon="💰"
                        title="Ingen affärsdata"
                        description="Analysen genererade inga budgetuppskattningar."
                      />
                    )}
                  </div>
                </TabsContent>
            </div>
            </Tabs>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-secondary/40 p-4">
              <div className="text-xs text-muted-foreground/70">
                {result.timestamp && (
                  <span>Analyserad: {new Date(result.timestamp).toLocaleString("sv-SE")}</span>
                )}
              </div>
              {/* Cost hidden from user - only logged server-side */}

              {/* Save error message */}
              {saveError && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-400">
                  {saveError}
                </div>
              )}
            </div>

            {/* Build overlay CTA */}
            <AnimatePresence>
              {showBuildOverlay && onBuildFromAudit && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm"
                  onClick={() => setShowBuildOverlay(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 24, stiffness: 260 }}
                    data-audit-build-overlay
                    tabIndex={-1}
                    className="border-brand-teal/40 w-full max-w-xl space-y-4 rounded-xl border bg-card p-6 shadow-2xl outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">🚀</div>
                      <div>
                        <h3 className="text-xl font-bold text-foreground">Låt oss bygga din sajt</h3>
                        <p className="text-sm text-foreground/90">
                          Vi använder auditen som superprompt för att skapa en förbättrad mall i
                          buildern.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>• Åtgärdar auditens problem och implementerar förbättringarna.</p>
                      <p>
                        • Behåller styrkor och varumärkeskänsla men optimerar UX, prestanda och SEO.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowBuildOverlay(false)}
                        className="flex-1 rounded-xl border border-border px-4 py-2 text-foreground/90 transition-colors hover:border-border hover:text-foreground"
                      >
                        Nej, inte nu
                      </button>
                      <button
                        onClick={launchBuildFromAudit}
                        className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 flex flex-1 items-center justify-center gap-2 rounded-xl bg-linear-to-r px-4 py-2 font-semibold text-white transition-all"
                      >
                        <Hammer className="h-4 w-4" />
                        Ja, kör igång
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}

      {/* PDF Report Modal */}
      {showPdfModal && result && (
        <AuditPdfReport result={result} onClose={() => setShowPdfModal(false)} />
      )}

      {/* Build Confirmation Dialog */}
      {showBuildConfirm && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-audit-nested-dialog
          className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowBuildConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="mb-4 text-4xl">🚀</div>
              <h3 className="mb-2 text-xl font-bold text-foreground">Bygg ny sida från auditen?</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Vi skapar en helt ny sida baserad på analysen av{" "}
                <span className="text-brand-teal font-medium">
                  {auditedUrl || result.domain || "din sida"}
                </span>
                .
              </p>
              <div className="mb-6 rounded-lg border border-border bg-secondary/40 p-4 text-left">
                <p className="mb-2 text-xs text-muted-foreground/70 uppercase">Detta kommer att:</p>
                <ul className="space-y-1 text-sm text-foreground/90">
                  <li className="flex items-start gap-2">
                    <Check className="text-brand-teal mt-0.5 h-4 w-4 shrink-0" />
                    <span>Åtgärda identifierade problem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="text-brand-teal mt-0.5 h-4 w-4 shrink-0" />
                    <span>Implementera förbättringsförslag</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="text-brand-teal mt-0.5 h-4 w-4 shrink-0" />
                    <span>Behålla dina styrkor och varumärke</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="text-brand-teal mt-0.5 h-4 w-4 shrink-0" />
                    <span>Skapa modern, professionell design</span>
                  </li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBuildConfirm(false)}
                  className="flex-1 rounded-xl border border-border px-4 py-2 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    setShowBuildConfirm(false);
                    launchBuildFromAudit();
                  }}
                  className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 flex flex-1 items-center justify-center gap-2 rounded-xl bg-linear-to-r px-4 py-2 font-semibold text-white transition-all"
                >
                  <Hammer className="h-4 w-4" />
                  Kör igång!
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="py-12 text-center">
      <span className="mb-4 block text-4xl">{icon}</span>
      <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground/70">{description}</p>
    </div>
  );
}
