"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  MetricsChart,
  ImprovementsList,
  SecurityReport,
  BudgetEstimate,
} from "@/components/audit";
import type { AuditResult } from "@/types/audit";

interface AuditModalProps {
  result: AuditResult | null;
  isOpen: boolean;
  onClose: () => void;
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

export function AuditModal({ result, isOpen, onClose }: AuditModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Reset tab when modal opens with new result
  useEffect(() => {
    if (isOpen && result) {
      setActiveTab("overview");
    }
  }, [isOpen, result]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEscape);
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

  const hasScores =
    result.audit_scores && Object.keys(result.audit_scores).length > 0;
  const hasImprovements = result.improvements && result.improvements.length > 0;
  const hasSecurity = result.security_analysis;
  const hasBudget = result.budget_estimate;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
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
                      {result.domain}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {result.company && (
                  <span className="px-3 py-1 bg-gray-800 text-gray-300 text-sm">
                    {result.company}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={downloadJSON}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
                >
                  <Download className="h-4 w-4" />
                  JSON
                </button>
                <button
                  onClick={onClose}
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
