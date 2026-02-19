"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search, Coins, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-store";
import { AUDIT_COSTS } from "@/lib/credits/pricing";
import type { AuditMode, AuditResult } from "@/types/audit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SiteAuditSectionProps {
  onAuditComplete: (result: AuditResult, auditedUrl: string) => void;
  onRequireAuth: () => void;
}

export function SiteAuditSection({ onAuditComplete, onRequireAuth }: SiteAuditSectionProps) {
  const { user, isAuthenticated, updateDiamonds } = useAuth();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [showModeDialog, setShowModeDialog] = useState(false);

  const canAffordBasic = user && user.diamonds >= AUDIT_COSTS.basic;
  const canAffordAdvanced = user && user.diamonds >= AUDIT_COSTS.advanced;

  useEffect(() => {
    const handleDialogClose = () => setShowModeDialog(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError(null);
    if (!url.trim()) {
      setError("Ange en URL för att analysera.");
      return;
    }

    setShowModeDialog(true);
  };

  const startAudit = async (mode: AuditMode) => {
    setShowModeDialog(false);
    setError(null);

    // Check authentication
    if (!isAuthenticated || !user) {
      onRequireAuth();
      return;
    }

    const auditCost = AUDIT_COSTS[mode];
    if (user.diamonds < auditCost) {
      setError(`Du behöver minst ${auditCost} credits. Du har ${user.diamonds}.`);
      return;
    }

    // Validate URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("Ange en URL för att analysera.");
      return;
    }

    // Auto-add https if missing
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    setIsLoading(true);
    setProgress(10);

    // Progress simulation
    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 5, 90));
    }, 1000);

    try {
      setProgress(20);

      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl, auditMode: mode }),
      });

      setProgress(80);

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          onRequireAuth();
          clearInterval(progressInterval);
          setIsLoading(false);
          setProgress(0);
          return;
        }
        if (response.status === 402) {
          setError(data.error || `Du behöver minst ${auditCost} credits.`);
          clearInterval(progressInterval);
          setIsLoading(false);
          setProgress(0);
          return;
        }
        throw new Error(data.error || "Något gick fel vid analysen.");
      }

      if (!data.success || !data.result) {
        throw new Error(data.error || "Kunde inte få resultat från analysen.");
      }

      setProgress(100);

      // Update local diamonds (server already deducted)
      if (user) {
        updateDiamonds(user.diamonds - auditCost);
      }

      // Pass result and URL to parent
      onAuditComplete(data.result, normalizedUrl);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ett oväntat fel uppstod.");
    } finally {
      clearInterval(progressInterval);
      setIsLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="w-full max-w-2xl">
      {/* Section Header */}
      <div className="mb-6 text-center">
        <div className="bg-brand-teal/10 border-brand-teal/30 mb-4 inline-flex items-center gap-2 border px-4 py-2">
          <Search className="text-brand-teal h-4 w-4" />
          <span className="text-brand-teal text-sm font-medium">Webbplatsanalys</span>
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white">Analysera en webbplats</h2>
        <p className="text-sm text-gray-400">
          Få en AI-driven analys av valfri webbplats med förbättringsförslag och budgetuppskattning.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label htmlFor="audit-url" className="sr-only">
            URL att analysera
          </label>
          <input
            id="audit-url"
            name="auditUrl"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="exempel.se eller https://exempel.se"
            autoComplete="url"
            disabled={isLoading}
            className="focus:border-brand-teal/50 focus:ring-brand-teal/50 w-full border border-gray-700 bg-black/50 px-4 py-4 pl-12 text-white placeholder-gray-500 transition-all focus:ring-1 focus:outline-none disabled:opacity-50"
          />
          <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-500" />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-2 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Progress Bar */}
        {isLoading && (
          <div className="h-1 w-full overflow-hidden bg-gray-800">
            <div
              className="bg-brand-teal h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="bg-brand-teal hover:bg-brand-teal/90 group flex w-full items-center justify-center gap-3 px-6 py-4 font-medium text-white transition-all disabled:cursor-not-allowed disabled:bg-gray-700"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analyserar...</span>
            </>
          ) : (
            <>
              <Search className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span>Välj analysnivå</span>
              <span className="flex items-center gap-1 bg-black/30 px-2 py-0.5 text-sm">
                <Coins className="text-brand-teal/80 h-3.5 w-3.5" />
                <span>
                  {AUDIT_COSTS.basic}/{AUDIT_COSTS.advanced}
                </span>
              </span>
            </>
          )}
        </button>

        {/* Credits Info */}
        {isAuthenticated && user && (
          <div className="space-y-1 text-center text-xs text-gray-500">
            <p>
              Du har{" "}
              <span
                className={user.diamonds >= AUDIT_COSTS.basic ? "text-brand-teal" : "text-red-400"}
              >
                {user.diamonds} credits
              </span>
            </p>
            <p>
              Vanlig:{" "}
              <span className={canAffordBasic ? "text-brand-teal" : "text-red-400"}>
                {AUDIT_COSTS.basic}
              </span>{" "}
              | Avancerad:{" "}
              <span className={canAffordAdvanced ? "text-brand-teal" : "text-red-400"}>
                {AUDIT_COSTS.advanced}
              </span>
            </p>
          </div>
        )}

        {!isAuthenticated && (
          <p className="text-center text-xs text-gray-500">
            <button
              type="button"
              onClick={onRequireAuth}
              className="text-brand-teal hover:text-brand-teal/80 underline"
            >
              Logga in
            </button>{" "}
            för att använda audit-funktionen.
          </p>
        )}
      </form>

      {/* Features List */}
      <div className="mt-8 grid grid-cols-2 gap-3 text-xs">
        {[
          { icon: "📊", text: "SEO & Prestanda" },
          { icon: "🔒", text: "Säkerhetsanalys" },
          { icon: "💰", text: "Budgetuppskattning" },
          { icon: "✨", text: "Affärs- & marknadsinsikter" },
        ].map((feature, index) => (
          <div
            key={`audit-feature-${index}-${feature.text || feature.icon}`}
            className="flex items-center gap-2 border border-gray-800 bg-black/30 p-2 text-gray-400"
          >
            <span>{feature.icon}</span>
            <span>{feature.text}</span>
          </div>
        ))}
      </div>

      <Dialog open={showModeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Välj analysnivå</DialogTitle>
            <DialogDescription>
              Vanlig ger en snabb kvalitetskontroll. Avancerad gör djupare marknads- och
              affärsanalys med fler dimensioner.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-6 pb-6 md:grid-cols-2">
            <button
              type="button"
              onClick={() => startAudit("basic")}
              className="hover:border-brand-teal/50 border border-gray-800 bg-black/40 p-4 text-left transition-colors"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Vanlig analys</span>
                <span className="text-brand-teal/80 flex items-center gap-1 text-xs">
                  <Coins className="h-3.5 w-3.5" />
                  {AUDIT_COSTS.basic}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Fokuserar på SEO, UX, prestanda och tydliga förbättringsförslag.
              </p>
            </button>
            <button
              type="button"
              onClick={() => startAudit("advanced")}
              className="hover:border-brand-blue/50 border border-gray-800 bg-black/40 p-4 text-left transition-colors"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Avancerad analys</span>
                <span className="text-brand-blue/80 flex items-center gap-1 text-xs">
                  <Coins className="h-3.5 w-3.5" />
                  {AUDIT_COSTS.advanced}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Inkluderar bransch, företagsstorlek, kundsegment, geo, konkurrens och affärslogik.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
