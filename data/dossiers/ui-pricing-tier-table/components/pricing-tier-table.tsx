"use client";

import { Check } from "lucide-react";
import { type ReactNode } from "react";

export interface PricingPlan {
  name: string;
  price: string;
  interval?: string;
  description?: string;
  features: string[];
  cta: ReactNode;
  highlighted?: boolean;
}

export interface PricingTierTableProps {
  title?: string;
  description?: string;
  plans: PricingPlan[];
}

export function PricingTierTable({
  title = "Välj din plan",
  description,
  plans,
}: PricingTierTableProps) {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <header className="mb-12 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          {description && (
            <p className="mt-3 text-base text-muted-foreground">{description}</p>
          )}
        </header>

        <div
          className={`grid gap-6 ${
            plans.length === 2
              ? "sm:grid-cols-2"
              : plans.length === 4
                ? "sm:grid-cols-2 lg:grid-cols-4"
                : "sm:grid-cols-2 lg:grid-cols-3"
          }`}
        >
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`flex flex-col rounded-xl border p-6 transition ${
                plan.highlighted
                  ? "border-primary bg-card shadow-lg ring-2 ring-primary/20"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-3 inline-flex w-fit items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  Mest populär
                </span>
              )}

              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                {plan.interval && (
                  <span className="text-sm text-muted-foreground">{plan.interval}</span>
                )}
              </div>

              <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">{plan.cta}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
