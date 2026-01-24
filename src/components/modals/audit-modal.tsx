"use client";

import {
  AuditPdfReport,
  BudgetEstimate,
  ImprovementsList,
  MetricsChart,
  SecurityReport,
} from "@/components/audit";
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
import { useCallback, useEffect, useState } from "react";

interface AuditModalProps {
  result: AuditResult | null;
  auditedUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBuildFromAudit?: (prompt: string) => void;
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
    return <p className="text-xs text-gray-500">–</p>;
  }
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-gray-300">
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
}: AuditModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showBuildConfirm, setShowBuildConfirm] = useState(false);
  const [showBuildOverlay, setShowBuildOverlay] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset state when modal opens with new result
  useEffect(() => {
    if (isOpen && result) {
      setActiveTab("overview");
      setIsSaved(false);
      setSaveError(null);
      setShowBuildConfirm(false);
    }
  }, [isOpen, result]);

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
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: result.domain ? `https://${result.domain}` : "",
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
  }, [result, isSaving, isSaved]);

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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't close if user is typing in an input field
        const target = e.target as HTMLElement;
        const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
        const isContentEditable = target.isContentEditable;

        if (isInput || isContentEditable) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape, true);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden border border-gray-800 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-800 p-4">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Analysresultat</h2>
                  <div className="mt-1 inline-flex items-center gap-2 text-xs text-gray-400">
                    <span className="border border-gray-800 bg-black/60 px-2 py-0.5 text-gray-300">
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
                  {scrapeLine && <div className="mt-1 text-[11px] text-gray-500">{scrapeLine}</div>}
                </div>
                {result.company && (
                  <span className="bg-gray-800 px-3 py-1 text-sm text-gray-300">
                    {result.company}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Save to account */}
                <button
                  onClick={handleSaveAudit}
                  disabled={isSaving || isSaved}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    isSaved
                      ? "cursor-default bg-green-600/20 text-green-400"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
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
                  className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  title="Ladda ner som PDF"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </button>

                {/* JSON Download */}
                <button
                  onClick={downloadJSON}
                  className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  title="Ladda ner rådata som JSON"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>

                {/* Build from Audit - Primary CTA */}
                {onBuildFromAudit && (
                  <button
                    onClick={() => {
                      setShowBuildOverlay(false);
                      setShowBuildConfirm(true);
                    }}
                    className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 shadow-brand-warm/25 hover:shadow-brand-warm/40 flex items-center gap-2 bg-linear-to-r px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all"
                    title="Skapa en ny sida baserad på denna analys"
                  >
                    <Hammer className="h-4 w-4" />
                    Bygg förbättrad sida
                  </button>
                )}

                <button
                  onClick={onClose}
                  aria-label="Stäng"
                  className="p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 items-center border-b border-gray-800">
              <button
                onClick={() => navigateTab("prev")}
                disabled={activeTab === tabs[0].id}
                aria-label="Föregående flik"
                className="p-3 text-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex flex-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? "text-brand-teal border-brand-teal bg-brand-teal/10 border-b-2"
                        : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => navigateTab("next")}
                disabled={activeTab === tabs[tabs.length - 1].id}
                aria-label="Nästa flik"
                className="p-3 text-gray-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                {/* Overview Tab */}
                {activeTab === "overview" && (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    {hasScores && result.audit_scores && (
                      <MetricsChart scores={result.audit_scores as { [key: string]: number }} />
                    )}

                    {/* Strengths & Issues Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="border border-green-500/30 bg-green-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-green-400">
                            <span>✅</span> Styrkor
                          </h3>
                          <ul className="space-y-2">
                            {result.strengths.slice(0, 5).map((strength, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                <span className="mt-0.5 text-green-400">•</span>
                                <span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.issues && result.issues.length > 0 && (
                        <div className="border border-red-500/30 bg-red-500/10 p-4">
                          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-red-400">
                            <span>⚠️</span> Problem
                          </h3>
                          <ul className="space-y-2">
                            {result.issues.slice(0, 5).map((issue, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
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
                      <div className="border border-gray-800 bg-black/30 p-4">
                        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-white">
                          <span>🎯</span> Förväntade resultat
                        </h3>
                        <ul className="grid gap-2 md:grid-cols-2">
                          {result.expected_outcomes.map((outcome, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 bg-black/30 p-2 text-sm text-gray-300"
                            >
                              <span className="text-brand-teal">📈</span>
                              <span>{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Improvements Tab */}
                {activeTab === "improvements" && (
                  <motion.div
                    key="improvements"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    {hasImprovements && result.improvements ? (
                      <ImprovementsList improvements={result.improvements} />
                    ) : (
                      <EmptyState
                        icon="✨"
                        title="Inga förbättringar"
                        description="Analysen genererade inga specifika förbättringsförslag."
                      />
                    )}
                  </motion.div>
                )}

                {/* Technical Tab */}
                {activeTab === "technical" && (
                  <motion.div
                    key="technical"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    {hasSecurity && result.security_analysis && (
                      <SecurityReport securityAnalysis={result.security_analysis} />
                    )}

                    {/* Technical Recommendations */}
                    {result.technical_recommendations &&
                      result.technical_recommendations.length > 0 && (
                        <div className="border border-gray-800 bg-black/50 p-6">
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
                            <span className="text-brand-teal">⚙️</span> Tekniska rekommendationer
                          </h3>
                          <div className="space-y-4">
                            {result.technical_recommendations.map((rec, i) => (
                              <div key={i} className="border border-gray-800 bg-black/30 p-4">
                                <h4 className="text-brand-teal mb-2 font-medium">{rec.area}</h4>
                                <p className="mb-2 text-sm text-gray-400">
                                  <span className="text-gray-500">Nuläge:</span> {rec.current_state}
                                </p>
                                <p className="text-sm text-gray-300">
                                  <span className="text-gray-500">Rekommendation:</span>{" "}
                                  {rec.recommendation}
                                </p>
                                {rec.implementation && (
                                  <pre className="mt-2 overflow-x-auto bg-black p-2 text-xs text-gray-400">
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
                  </motion.div>
                )}

                {/* Business/Budget Tab */}
                {activeTab === "business" && (
                  <motion.div
                    key="business"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    {hasBudget && result.budget_estimate && (
                      <BudgetEstimate budget={result.budget_estimate} />
                    )}

                    {/* Competitor Insights */}
                    {result.competitor_insights && (
                      <div className="border border-gray-800 bg-black/50 p-6">
                        <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
                          <span className="text-brand-teal">🏆</span> Konkurrentanalys
                        </h3>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="border border-gray-800 bg-black/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-gray-400">
                              Branschstandard
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                              {sanitizeDisplayText(result.competitor_insights.industry_standards)}
                            </p>
                          </div>
                          <div className="border border-gray-800 bg-black/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-gray-400">
                              Saknade funktioner
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                              {sanitizeDisplayText(result.competitor_insights.missing_features)}
                            </p>
                          </div>
                          <div className="border border-gray-800 bg-black/30 p-3">
                            <h4 className="mb-2 text-sm font-medium text-gray-400">
                              Unika styrkor
                            </h4>
                            <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                              {sanitizeDisplayText(result.competitor_insights.unique_strengths)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasAdvancedBusiness && (
                      <div className="space-y-5 border border-gray-800 bg-black/50 p-6">
                        <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-white">
                          <span className="text-brand-blue">🧭</span> Affärs- & marknadsprofil
                        </h3>

                        {hasBusinessProfile && result.business_profile && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-300">Företagsprofil</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Bransch</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.business_profile.industry)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Företagsstorlek</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.business_profile.company_size)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Affärsmodell</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.business_profile.business_model)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Mognadsgrad</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.business_profile.maturity)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Kärnerbjudanden</p>
                                {renderTextList(result.business_profile.core_offers)}
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Intäktsströmmar</p>
                                {renderTextList(result.business_profile.revenue_streams)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasMarketContext && result.market_context && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-300">
                              Marknad & geografi
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Primär geografi</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.market_context.primary_geography)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Serviceområde</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.market_context.service_area)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Konkurrensnivå</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.market_context.competition_level)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Nyckelkonkurrenter</p>
                                {renderTextList(result.market_context.key_competitors)}
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Säsongsmönster</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.market_context.seasonal_patterns)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">
                                  Lokala marknadsdynamiker
                                </p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.market_context.local_market_dynamics)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCustomerSegments && result.customer_segments && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-300">Kundsegment</h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Primär kundgrupp</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.customer_segments.primary_segment)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Sekundära kundgrupper</p>
                                {renderTextList(result.customer_segments.secondary_segments)}
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Kundbehov</p>
                                {renderTextList(result.customer_segments.customer_needs)}
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Beslutstriggers</p>
                                {renderTextList(result.customer_segments.decision_triggers)}
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-gray-400">Förtroendesignaler</p>
                                {renderTextList(result.customer_segments.trust_signals)}
                              </div>
                            </div>
                          </div>
                        )}

                        {hasCompetitiveLandscape && result.competitive_landscape && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-300">
                              Konkurrenslandskap
                            </h4>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Positionering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(result.competitive_landscape.positioning)}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Differentiering</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.differentiation,
                                  )}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Prisposition</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.price_positioning,
                                  )}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3">
                                <p className="mb-1 text-xs text-gray-400">Inträdesbarriärer</p>
                                <p className="text-sm wrap-break-word whitespace-pre-wrap text-gray-300">
                                  {sanitizeDisplayText(
                                    result.competitive_landscape.barriers_to_entry,
                                  )}
                                </p>
                              </div>
                              <div className="border border-gray-800 bg-black/30 p-3 md:col-span-2">
                                <p className="mb-1 text-xs text-gray-400">Möjligheter</p>
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between border-t border-gray-800 bg-black/50 p-4">
              <div className="text-xs text-gray-500">
                {result.timestamp && (
                  <span>Analyserad: {new Date(result.timestamp).toLocaleString("sv-SE")}</span>
                )}
              </div>
              {/* Cost hidden from user - only logged server-side */}

              {/* Save error message */}
              {saveError && (
                <div className="mt-2 border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-400">
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
                  className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
                  onClick={() => setShowBuildOverlay(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 24, stiffness: 260 }}
                    className="border-brand-teal/40 w-full max-w-xl space-y-4 border bg-gray-900 p-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">🚀</div>
                      <div>
                        <h3 className="text-xl font-bold text-white">Låt oss bygga din sajt</h3>
                        <p className="text-sm text-gray-300">
                          Vi använder auditen som superprompt för att skapa en förbättrad mall i
                          buildern.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-sm text-gray-400">
                      <p>• Åtgärdar auditens problem och implementerar förbättringarna.</p>
                      <p>
                        • Behåller styrkor och varumärkeskänsla men optimerar UX, prestanda och SEO.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowBuildOverlay(false)}
                        className="flex-1 border border-gray-700 px-4 py-2 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                      >
                        Nej, inte nu
                      </button>
                      <button
                        onClick={launchBuildFromAudit}
                        className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 flex flex-1 items-center justify-center gap-2 bg-linear-to-r px-4 py-2 font-semibold text-white transition-all"
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
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setShowBuildConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md border border-gray-700 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="mb-4 text-4xl">🚀</div>
              <h3 className="mb-2 text-xl font-bold text-white">Bygg ny sida från auditen?</h3>
              <p className="mb-4 text-sm text-gray-400">
                Vi skapar en helt ny sida baserad på analysen av{" "}
                <span className="text-brand-teal font-medium">
                  {auditedUrl || result.domain || "din sida"}
                </span>
                .
              </p>
              <div className="mb-6 border border-gray-800 bg-black/50 p-4 text-left">
                <p className="mb-2 text-xs text-gray-500 uppercase">Detta kommer att:</p>
                <ul className="space-y-1 text-sm text-gray-300">
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
                  className="flex-1 border border-gray-700 px-4 py-2 text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    setShowBuildConfirm(false);
                    launchBuildFromAudit();
                  }}
                  className="from-brand-blue to-brand-warm hover:from-brand-blue/90 hover:to-brand-warm/90 flex flex-1 items-center justify-center gap-2 bg-linear-to-r px-4 py-2 font-semibold text-white transition-all"
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
      <h3 className="mb-2 text-lg font-medium text-white">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
