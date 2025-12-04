"use client";

import { useState, FormEvent } from "react";
import { Search, Diamond, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import type { AuditResult } from "@/types/audit";

const AUDIT_COST = 3;

interface SiteAuditSectionProps {
  onAuditComplete: (result: AuditResult) => void;
  onRequireAuth: () => void;
}

export function SiteAuditSection({
  onAuditComplete,
  onRequireAuth,
}: SiteAuditSectionProps) {
  const { user, isAuthenticated, updateDiamonds } = useAuth();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const canAfford = user && user.diamonds >= AUDIT_COST;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check authentication
    if (!isAuthenticated || !user) {
      onRequireAuth();
      return;
    }

    // Check credits
    if (!canAfford) {
      setError(
        `Du behöver minst ${AUDIT_COST} diamanter. Du har ${user.diamonds}.`
      );
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
        body: JSON.stringify({ url: normalizedUrl }),
      });

      setProgress(80);

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          onRequireAuth();
          return;
        }
        if (response.status === 402) {
          setError(data.error || `Du behöver minst ${AUDIT_COST} diamanter.`);
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
        updateDiamonds(user.diamonds - AUDIT_COST);
      }

      // Pass result to parent
      onAuditComplete(data.result);
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
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-500/30 mb-4">
          <Search className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-medium text-teal-400">
            Webbplatsanalys
          </span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Analysera en webbplats
        </h2>
        <p className="text-gray-400 text-sm">
          Få en AI-driven analys av valfri webbplats med förbättringsförslag och
          budgetuppskattning.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="exempel.se eller https://exempel.se"
            disabled={isLoading}
            className="w-full px-4 py-4 pl-12 bg-black/50 border border-gray-700 text-white placeholder-gray-500 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all disabled:opacity-50"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Progress Bar */}
        {isLoading && (
          <div className="w-full h-1 bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-teal-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium transition-all group"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Analyserar...</span>
            </>
          ) : (
            <>
              <Search className="h-5 w-5 group-hover:scale-110 transition-transform" />
              <span>Analysera webbplats</span>
              <span className="flex items-center gap-1 px-2 py-0.5 bg-black/30 text-sm">
                <Diamond className="h-3.5 w-3.5 text-teal-300" />
                <span>{AUDIT_COST}</span>
              </span>
            </>
          )}
        </button>

        {/* Credits Info */}
        {isAuthenticated && user && (
          <p className="text-center text-xs text-gray-500">
            Du har{" "}
            <span
              className={
                user.diamonds >= AUDIT_COST ? "text-teal-400" : "text-red-400"
              }
            >
              {user.diamonds} diamanter
            </span>
            {user.diamonds < AUDIT_COST && (
              <span className="text-gray-400"> (behöver {AUDIT_COST})</span>
            )}
          </p>
        )}

        {!isAuthenticated && (
          <p className="text-center text-xs text-gray-500">
            <button
              type="button"
              onClick={onRequireAuth}
              className="text-teal-400 hover:text-teal-300 underline"
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
          { icon: "✨", text: "Förbättringsförslag" },
        ].map((feature) => (
          <div
            key={feature.text}
            className="flex items-center gap-2 p-2 bg-black/30 border border-gray-800 text-gray-400"
          >
            <span>{feature.icon}</span>
            <span>{feature.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
