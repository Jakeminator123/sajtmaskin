"use client";

import { useEffect, useState } from "react";
import { Loader2, Rocket, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntakeSummaryData {
  scaffold: { id: string; label: string; description: string };
  integrations: string[];
  suggestedPages: string[];
}

interface IntakeSummaryCardProps {
  prompt: string;
  siteType?: string;
  scrapeText?: string;
  onBuild: () => void;
  onEdit: () => void;
  disabled?: boolean;
}

export function IntakeSummaryCard({
  prompt,
  siteType,
  scrapeText,
  onBuild,
  onEdit,
  disabled = false,
}: IntakeSummaryCardProps) {
  const [data, setData] = useState<IntakeSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/ai/intake-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.slice(0, 5000), siteType, scrapeText: scrapeText?.slice(0, 3000) }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setData(json as IntakeSummaryData);
      })
      .catch(() => {
        if (cancelled) return;
        setData({
          scaffold: { id: "base-nextjs", label: "Standard", description: "Generell sajt" },
          integrations: [],
          suggestedPages: ["Startsida"],
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [prompt, siteType, scrapeText]);

  if (loading) {
    return (
      <div className="mx-3 my-2 flex items-center gap-2 rounded-2xl border border-border/30 bg-card/80 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Analyserar ditt projekt...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mx-3 my-2 space-y-3 rounded-2xl border border-border/30 bg-card/80 px-4 py-4">
      <p className="text-xs font-semibold text-foreground">Så bygger vi din sajt:</p>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 font-medium text-muted-foreground">Mall:</span>
          <span className="text-foreground">{data.scaffold.label}</span>
        </div>

        {data.suggestedPages.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium text-muted-foreground">Sidor:</span>
            <span className="text-foreground">{data.suggestedPages.join(" | ")}</span>
          </div>
        )}

        {data.integrations.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-medium text-muted-foreground">Funktioner:</span>
            <span className="text-foreground">{data.integrations.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onBuild}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/90",
          )}
        >
          <Rocket className="h-3.5 w-3.5" />
          Bygga nu
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/40 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Ändra...
        </button>
      </div>
    </div>
  );
}
