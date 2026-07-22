import type { ReactNode } from "react";
import { Check } from "lucide-react";

export interface PricingPlan {
  name: string;
  price: string;
  interval?: string;
  description?: string;
  features: string[];
  cta: ReactNode;
  highlighted?: boolean;
}

interface PricingTierTableProps {
  title?: string;
  description?: string;
  plans: PricingPlan[];
  className?: string;
}

export function PricingTierTable({
  title,
  description,
  plans,
  className,
}: PricingTierTableProps) {
  return (
    <section className={className ?? "mx-auto max-w-6xl px-4 py-16"}>
      {(title || description) && (
        <div className="mb-10 text-center">
          {title && <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>}
          {description && (
            <p className="mt-3 text-base text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={
              plan.highlighted
                ? "flex flex-col rounded-lg border-2 border-primary bg-card p-6 shadow-sm"
                : "flex flex-col rounded-lg border bg-card p-6"
            }
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
              {plan.interval && (
                <span className="ml-1 text-sm text-muted-foreground">{plan.interval}</span>
              )}
            </div>
            <ul className="mb-6 flex-1 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <div>{plan.cta}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
