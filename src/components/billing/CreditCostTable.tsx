"use client";

import { ArrowRight, Coins, Globe, Sparkles, Wand2, Zap } from "lucide-react";
import type { CreditCostBreakdown } from "@/lib/credits/pricing";
import { usePublicPricing } from "@/lib/credits/use-public-pricing";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { MODEL_LABELS } from "@/lib/models/catalog";

type CostRow = {
  label: string;
  cost: number;
  icon: typeof Wand2;
  color: string;
};

function costRows(breakdown: CreditCostBreakdown): CostRow[] {
  return [
    { label: `Generering (${MODEL_LABELS.pro})`, cost: breakdown.generatePro, icon: Wand2, color: "text-brand-teal" },
    { label: `Generering (${MODEL_LABELS.max})`, cost: breakdown.generateMax, icon: Wand2, color: "text-brand-teal" },
    { label: `Generering (${MODEL_LABELS.premium})`, cost: breakdown.generatePremium, icon: Wand2, color: "text-brand-teal" },
    { label: `Generering (${MODEL_LABELS.ultra})`, cost: breakdown.generateUltra, icon: Wand2, color: "text-brand-teal" },
    { label: `Förfining (${MODEL_LABELS.pro})`, cost: breakdown.refinePro, icon: Zap, color: "text-brand-amber" },
    { label: `Förfining (${MODEL_LABELS.max})`, cost: breakdown.refineMax, icon: Zap, color: "text-brand-amber" },
    { label: `Förfining (${MODEL_LABELS.premium})`, cost: breakdown.refinePremium, icon: Zap, color: "text-brand-amber" },
    { label: `Förfining (${MODEL_LABELS.ultra})`, cost: breakdown.refineUltra, icon: Zap, color: "text-brand-amber" },
    { label: "Frågeguiden", cost: breakdown.wizard, icon: Sparkles, color: "text-brand-blue" },
    { label: "Analys (bas)", cost: breakdown.auditBasic, icon: Globe, color: "text-brand-warm" },
    { label: "Analys (utökad)", cost: breakdown.auditAdvanced, icon: Globe, color: "text-brand-warm" },
    { label: "Publicering", cost: breakdown.deploy, icon: ArrowRight, color: "text-muted-foreground" },
  ];
}

/**
 * Konkret exempel på vad det minsta paketet räcker till, räknat på den
 * billigaste nivån. Returnerar null när priserna inte går ihop (t.ex. om en
 * generering kostar mer än paketet) så sidan aldrig lovar något fel.
 */
export function smallestPackageExample(breakdown: CreditCostBreakdown): string | null {
  const pkg = CREDIT_PACKAGES[0];
  const generate = breakdown.generatePro;
  const refine = breakdown.refinePro;
  const deploy = breakdown.deploy;
  if (generate <= 0 || refine <= 0 || generate + deploy > pkg.credits) return null;
  const refines = Math.floor((pkg.credits - generate - deploy) / refine);
  const refineText =
    refines > 0 ? `, ${refines} ${refines === 1 ? "förfining" : "förfiningar"}` : "";
  return `${pkg.name} (${pkg.credits} credits) räcker till exempel till en generering${refineText} och en publicering på nivån ${MODEL_LABELS.pro}.`;
}

export function CreditCostTable({ className = "" }: { className?: string }) {
  const { breakdown } = usePublicPricing();
  const example = smallestPackageExample(breakdown);

  return (
    <div className={className}>
      <h2 className="text-foreground mb-8 text-center text-xl font-semibold">Vad kostar det?</h2>
      <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-2">
        {costRows(breakdown).map((item) => (
          <div
            key={item.label}
            className="border-border bg-card/50 flex items-center justify-between rounded-lg border px-4 py-2.5"
          >
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <item.icon className={`h-4 w-4 shrink-0 ${item.color}`} aria-hidden="true" />
              {item.label}
            </span>
            <span className="text-foreground flex items-center gap-1 text-sm font-semibold">
              <Coins className="text-brand-amber h-3.5 w-3.5" aria-hidden="true" />
              {item.cost}
            </span>
          </div>
        ))}
      </div>
      {example ? (
        <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-center text-sm">{example}</p>
      ) : null}
      <p className="text-muted-foreground mt-2 text-center text-xs">
        Engångsköp – credits gäller för alltid, ingen prenumeration.
      </p>
    </div>
  );
}
