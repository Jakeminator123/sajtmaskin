"use client";

import { AuditPdfReport } from "@/components/audit/AuditPdfReport";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuditModalProps, TabId } from "./types";
import { tabs } from "./helpers";
import { useAuditModalController } from "./use-audit-modal-controller";
import { AuditModalPanels } from "./AuditModalPanels";

function AuditModal({
  result,
  auditedUrl,
  isOpen,
  onClose,
  onBuildFromAudit,
  alreadySaved,
}: AuditModalProps) {
  const {
    activeTab,
    setActiveTab,
    showPdfModal,
    setShowPdfModal,
    showBuildConfirm,
    setShowBuildConfirm,
    showBuildOverlay,
    setShowBuildOverlay,
    isSaving,
    isSaved,
    saveError,
    dialogRef,
    handleSaveAudit,
    launchBuildFromAudit,
    downloadJSON,
    navigateTab,
  } = useAuditModalController({
    result,
    auditedUrl,
    isOpen,
    onClose,
    onBuildFromAudit,
    alreadySaved,
  });

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

                <AuditModalPanels
                  result={result}
                  hasScores={Boolean(hasScores)}
                  hasImprovements={Boolean(hasImprovements)}
                  hasSecurity={Boolean(hasSecurity)}
                  hasBudget={Boolean(hasBudget)}
                  hasBusinessProfile={Boolean(hasBusinessProfile)}
                  hasMarketContext={Boolean(hasMarketContext)}
                  hasCustomerSegments={Boolean(hasCustomerSegments)}
                  hasCompetitiveLandscape={Boolean(hasCompetitiveLandscape)}
                  hasAdvancedBusiness={Boolean(hasAdvancedBusiness)}
                />

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
          tabIndex={-1}
          className="fixed inset-0 z-60 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm outline-none"
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

export { AuditModal };
