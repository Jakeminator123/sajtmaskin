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
        "Behåll varumärkeskänslan (färger, logoplacering, tonalitet) men åtgärda alla brister och förbättra UX, prestanda och tillgänglighet."
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
      if (scores.performance)
        lines.push(`- Prestanda: ${scores.performance}/100`);
      if (scores.ux) lines.push(`- UX: ${scores.ux}/100`);
      if (scores.accessibility)
        lines.push(`- Tillgänglighet: ${scores.accessibility}/100`);
      if (scores.security) lines.push(`- Säkerhet: ${scores.security}/100`);
      if (scores.mobile) lines.push(`- Mobil: ${scores.mobile}/100`);
      if (scores.content) lines.push(`- Innehåll: ${scores.content}/100`);
      if (scores.technical_seo)
        lines.push(`- Teknisk SEO: ${scores.technical_seo}/100`);
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
        lines.push(
          `- ${imp.item}${
            contextParts.length ? ` (${contextParts.join("; ")})` : ""
          }`
        );
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
      if (result.design_direction.style)
        lines.push(`- Stil: ${result.design_direction.style}`);
      if (result.design_direction.color_psychology)
        lines.push(
          `- Färgpsykologi: ${result.design_direction.color_psychology}`
        );
      if (result.design_direction.ui_patterns)
        lines.push(
          `- UI-mönster: ${result.design_direction.ui_patterns.join(", ")}`
        );
      if (result.design_direction.accessibility_level)
        lines.push(
          `- Tillgänglighet: ${result.design_direction.accessibility_level}`
        );
    }

    if (result.target_audience_analysis) {
      lines.push("");
      lines.push("Målgrupp & beteende:");
      if (result.target_audience_analysis.demographics)
        lines.push(
          `- Demografi: ${result.target_audience_analysis.demographics}`
        );
      if (result.target_audience_analysis.pain_points)
        lines.push(
          `- Smärtpunkter: ${result.target_audience_analysis.pain_points}`
        );
      if (result.target_audience_analysis.expectations)
        lines.push(
          `- Förväntningar: ${result.target_audience_analysis.expectations}`
        );
    }

    if (
      result.content_strategy?.key_pages &&
      result.content_strategy.key_pages.length > 0
    ) {
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

    if (
      result.priority_matrix?.quick_wins &&
      result.priority_matrix.quick_wins.length > 0
    ) {
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
        lines.push(
          `- Potentiella risker: ${result.security_analysis.vulnerabilities.join(
            ", "
          )}`
        );
      }
    }

    if (
      result.technical_recommendations &&
      result.technical_recommendations.length > 0
    ) {
      lines.push("");
      lines.push("Tekniska rekommendationer att omsätta:");
      result.technical_recommendations.slice(0, 4).forEach((rec) => {
        lines.push(
          `- ${rec.area}: ${rec.recommendation} (nuläge: ${rec.current_state})`
        );
      });
    }

    lines.push("");
    lines.push("Struktur att bygga (anpassa efter innehåll):");
    lines.push("- Navigering med logoplatshållare, sektion-ankare, CTA-knapp.");
    lines.push(
      "- Hero med tydlig huvudtitel, underrad, primär CTA, sekundär CTA samt visuell bakgrund (bild/gradient) och kort trust-rad."
    );
    lines.push(
      "- Sektioner för erbjudanden/tjänster, USP-lista, case/portfolio eller testimonials, ett CTA-block mitt på sidan."
    );
    lines.push(
      "- Sektion för innehåll/nyheter eller resurser om relevant, samt FAQ och tydligt kontaktblock med formulär + kontaktuppgifter."
    );
    lines.push("- Footer med länkar, sociala ikoner och kontaktinformation.");

    lines.push("");
    lines.push("Design & kvalitet:");
    lines.push("- Använd färger/typo inspirerat av referenssidan.");
    lines.push("- Responsivt (mobil först), WCAG AA, hög läsbarhet.");
    lines.push("- Optimera bilder (komprimerade) och undvik tunga effekter.");

    lines.push("");
    lines.push(
      "Språk & ton: Svenska, konkret, säljdrivande men trovärdigt. Anpassa copy till målgruppen."
    );
    lines.push(
      "Leverera en klar, konverterande layout som kan genereras i buildern utan ytterligare frågor."
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
        const isInput =
          target.tagName === "INPUT" || target.tagName === "TEXTAREA";
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
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        result.domain
      )}&sz=64`
    : null;

  const scrapeLine = scrape
    ? `Scrape: ${scrape.pages_sampled} sida(or), ${scrape.aggregated_word_count} ord${
        scrape.is_js_rendered ? " • JS-renderad" : ""
      }${typeof scrape.web_search_calls === "number" ? ` • Web search: ${scrape.web_search_calls}` : ""}`
    : null;

  const hasScores =
    result.audit_scores && Object.keys(result.audit_scores).length > 0;
  const hasImprovements = result.improvements && result.improvements.length > 0;
  const hasSecurity = result.security_analysis;
  const hasBudget = result.budget_estimate;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="audit-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-5xl max-h-[90vh] bg-black border border-gray-800 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Analysresultat
                  </h2>
                  {result.domain && (
                    <a
                      href={`https://${result.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-teal-400 hover:text-teal-300 flex items-center gap-1"
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
                  {scrapeLine && (
                    <div className="text-[11px] text-gray-500 mt-1">
                      {scrapeLine}
                    </div>
                  )}
                </div>
                {result.company && (
                  <span className="px-3 py-1 bg-gray-800 text-gray-300 text-sm">
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
                      ? "bg-green-600/20 text-green-400 cursor-default"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                  }`}
                  title={
                    isSaved ? "Sparad i ditt konto" : "Spara till ditt konto"
                  }
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
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                  title="Ladda ner som PDF"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </button>

                {/* JSON Download */}
                <button
                  onClick={downloadJSON}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
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
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-sm font-semibold transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40"
                    title="Skapa en ny sida baserad på denna analys"
                  >
                    <Hammer className="h-4 w-4" />
                    Bygg förbättrad sida
                  </button>
                )}

                <button
                  onClick={onClose}
                  aria-label="Stäng"
                  className="p-2 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center border-b border-gray-800 flex-shrink-0">
              <button
                onClick={() => navigateTab("prev")}
                disabled={activeTab === tabs[0].id}
                aria-label="Föregående flik"
                className="p-3 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex-1 flex overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "text-teal-400 border-b-2 border-teal-400 bg-teal-500/5"
                        : "text-gray-400 hover:text-white hover:bg-gray-800/50"
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
                className="p-3 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
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
                      <MetricsChart
                        scores={
                          result.audit_scores as { [key: string]: number }
                        }
                      />
                    )}

                    {/* Strengths & Issues Grid */}
                    <div className="grid md:grid-cols-2 gap-4">
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="p-4 bg-green-500/10 border border-green-500/30">
                          <h3 className="text-lg font-bold text-green-400 mb-3 flex items-center gap-2">
                            <span>✅</span> Styrkor
                          </h3>
                          <ul className="space-y-2">
                            {result.strengths.slice(0, 5).map((strength, i) => (
                              <li
                                key={i}
                                className="text-sm text-gray-300 flex items-start gap-2"
                              >
                                <span className="text-green-400 mt-0.5">•</span>
                                <span>{strength}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.issues && result.issues.length > 0 && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30">
                          <h3 className="text-lg font-bold text-red-400 mb-3 flex items-center gap-2">
                            <span>⚠️</span> Problem
                          </h3>
                          <ul className="space-y-2">
                            {result.issues.slice(0, 5).map((issue, i) => (
                              <li
                                key={i}
                                className="text-sm text-gray-300 flex items-start gap-2"
                              >
                                <span className="text-red-400 mt-0.5">•</span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Expected Outcomes */}
                    {result.expected_outcomes &&
                      result.expected_outcomes.length > 0 && (
                        <div className="p-4 bg-black/30 border border-gray-800">
                          <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                            <span>🎯</span> Förväntade resultat
                          </h3>
                          <ul className="grid md:grid-cols-2 gap-2">
                            {result.expected_outcomes.map((outcome, i) => (
                              <li
                                key={i}
                                className="text-sm text-gray-300 flex items-start gap-2 p-2 bg-black/30"
                              >
                                <span className="text-teal-400">📈</span>
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
                      <SecurityReport
                        securityAnalysis={result.security_analysis}
                      />
                    )}

                    {/* Technical Recommendations */}
                    {result.technical_recommendations &&
                      result.technical_recommendations.length > 0 && (
                        <div className="bg-black/50 border border-gray-800 p-6">
                          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <span className="text-teal-400">⚙️</span> Tekniska
                            rekommendationer
                          </h3>
                          <div className="space-y-4">
                            {result.technical_recommendations.map((rec, i) => (
                              <div
                                key={i}
                                className="p-4 bg-black/30 border border-gray-800"
                              >
                                <h4 className="font-medium text-teal-400 mb-2">
                                  {rec.area}
                                </h4>
                                <p className="text-sm text-gray-400 mb-2">
                                  <span className="text-gray-500">Nuläge:</span>{" "}
                                  {rec.current_state}
                                </p>
                                <p className="text-sm text-gray-300">
                                  <span className="text-gray-500">
                                    Rekommendation:
                                  </span>{" "}
                                  {rec.recommendation}
                                </p>
                                {rec.implementation && (
                                  <pre className="mt-2 p-2 bg-black text-xs text-gray-400 overflow-x-auto">
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
                      <div className="bg-black/50 border border-gray-800 p-6">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                          <span className="text-teal-400">🏆</span>{" "}
                          Konkurrentanalys
                        </h3>
                        <div className="grid md:grid-cols-3 gap-4">
                          <div className="p-3 bg-black/30 border border-gray-800">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">
                              Branschstandard
                            </h4>
                            <p className="text-sm text-gray-300">
                              {result.competitor_insights.industry_standards}
                            </p>
                          </div>
                          <div className="p-3 bg-black/30 border border-gray-800">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">
                              Saknade funktioner
                            </h4>
                            <p className="text-sm text-gray-300">
                              {result.competitor_insights.missing_features}
                            </p>
                          </div>
                          <div className="p-3 bg-black/30 border border-gray-800">
                            <h4 className="text-sm font-medium text-gray-400 mb-2">
                              Unika styrkor
                            </h4>
                            <p className="text-sm text-gray-300">
                              {result.competitor_insights.unique_strengths}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!hasBudget && !result.competitor_insights && (
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
            <div className="flex items-center justify-between p-4 border-t border-gray-800 flex-shrink-0 bg-black/50">
              <div className="text-xs text-gray-500">
                {result.timestamp && (
                  <span>
                    Analyserad:{" "}
                    {new Date(result.timestamp).toLocaleString("sv-SE")}
                  </span>
                )}
              </div>
              {/* Cost hidden from user - only logged server-side */}

              {/* Save error message */}
              {saveError && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
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
                  className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                  onClick={() => setShowBuildOverlay(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    transition={{ type: "spring", damping: 24, stiffness: 260 }}
                    className="w-full max-w-xl bg-gray-900 border border-teal-700/40 shadow-2xl p-6 space-y-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">🚀</div>
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          Låt oss bygga din sajt
                        </h3>
                        <p className="text-sm text-gray-300">
                          Vi använder auditen som superprompt för att skapa en
                          förbättrad mall i buildern.
                        </p>
                      </div>
                    </div>

                    <div className="text-sm text-gray-400 space-y-1">
                      <p>
                        • Åtgärdar auditens problem och implementerar
                        förbättringarna.
                      </p>
                      <p>
                        • Behåller styrkor och varumärkeskänsla men optimerar
                        UX, prestanda och SEO.
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowBuildOverlay(false)}
                        className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                      >
                        Nej, inte nu
                      </button>
                      <button
                        onClick={launchBuildFromAudit}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold transition-all"
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
        <AuditPdfReport
          result={result}
          onClose={() => setShowPdfModal(false)}
        />
      )}

      {/* Build Confirmation Dialog */}
      {showBuildConfirm && result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setShowBuildConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gray-900 border border-gray-700 max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-xl font-bold text-white mb-2">
                Bygg ny sida från auditen?
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                Vi skapar en helt ny sida baserad på analysen av{" "}
                <span className="text-teal-400 font-medium">
                  {auditedUrl || result.domain || "din sida"}
                </span>
                .
              </p>
              <div className="bg-black/50 border border-gray-800 p-4 text-left mb-6">
                <p className="text-xs text-gray-500 uppercase mb-2">
                  Detta kommer att:
                </p>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-400 mt-0.5 shrink-0" />
                    <span>Åtgärda identifierade problem</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-400 mt-0.5 shrink-0" />
                    <span>Implementera förbättringsförslag</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-400 mt-0.5 shrink-0" />
                    <span>Behålla dina styrkor och varumärke</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-teal-400 mt-0.5 shrink-0" />
                    <span>Skapa modern, professionell design</span>
                  </li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBuildConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  onClick={() => {
                    setShowBuildConfirm(false);
                    launchBuildFromAudit();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold transition-all"
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
    <div className="text-center py-12">
      <span className="text-4xl mb-4 block">{icon}</span>
      <h3 className="text-lg font-medium text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}
