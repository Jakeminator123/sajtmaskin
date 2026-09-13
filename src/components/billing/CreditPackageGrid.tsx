"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { creditPackageCopy } from "@/lib/billing/credit-package-copy";
import { Button } from "@/components/ui/button";
import {
  CREDIT_PACKAGES,
  type CreditPackage,
  type CreditPackageId,
} from "@/lib/billing/credit-packages";

type CreditPackageGridProps = {
  onSelect: (id: CreditPackageId) => void;
  ctaLabel: (pkg: CreditPackage) => string;
  disabled?: boolean;
  pendingId?: string | null;
};

export function CreditPackageGrid({
  onSelect,
  ctaLabel,
  disabled = false,
  pendingId = null,
}: CreditPackageGridProps) {
  return (
    <div className="grid items-start gap-6 md:grid-cols-3">
      {CREDIT_PACKAGES.map((pkg) => {
        const copy = creditPackageCopy[pkg.id];
        const pending = pendingId === pkg.id;
        return (
          <div
            key={pkg.id}
            className={`relative flex flex-col gap-5 rounded-2xl border p-7 transition-all ${
              pkg.popular
                ? "border-primary/30 bg-primary/5 shadow-xl shadow-primary/5 md:-my-2 md:scale-105"
                : "border-border/20 bg-card/50"
            }`}
          >
            {pkg.popular ? (
              <div className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider uppercase">
                Populärast
              </div>
            ) : null}
            <div>
              <h3 className="text-foreground text-lg font-semibold">{pkg.name}</h3>
              <p className="text-muted-foreground mt-0.5 text-sm">{copy.description}</p>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-foreground text-3xl font-semibold">{pkg.price} kr</span>
              <span className="text-muted-foreground mb-1 text-sm">{pkg.credits} credits</span>
            </div>
            <p className="text-muted-foreground -mt-2 text-xs">
              {(pkg.price / pkg.credits).toFixed(1)} kr/credit
            </p>
            <div className="bg-border/20 h-px" />
            <ul className="flex-1 space-y-3">
              {copy.features.map((feature) => (
                <li key={feature} className="text-muted-foreground flex items-start gap-2.5 text-sm">
                  <CheckCircle2 className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              className={`mt-2 w-full font-medium ${
                pkg.popular
                  ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-lg shadow-primary/20"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
              disabled={disabled}
              onClick={() => onSelect(pkg.id)}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel(pkg)}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
