import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

/**
 * Three-tier pricing section with a featured middle plan. Curated from the
 * proven `saas-landing` scaffold (pricing-card.tsx + the pricing section in
 * app/page.tsx), inlined into one self-contained file.
 */

type PricingTier = {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
};

const tiers: PricingTier[] = [
  {
    name: "Starter",
    price: "$29",
    description: "For small teams validating the workflow.",
    features: ["3 team members", "Core automations", "Weekly reports"],
  },
  {
    name: "Growth",
    price: "$89",
    description: "For teams scaling operations across multiple workstreams.",
    features: ["Unlimited projects", "Priority support", "Advanced analytics"],
    featured: true,
  },
  {
    name: "Scale",
    price: "Custom",
    description: "For larger teams with roles, governance, and rollout needs.",
    features: ["SSO / SAML", "Advanced permissions", "Dedicated onboarding"],
  },
];

function PricingCard({ name, price, description, features, featured = false }: PricingTier) {
  return (
    <Card className={featured ? "rounded-[1.6rem] border-primary/35 bg-card shadow-lg shadow-primary/10" : "rounded-[1.6rem] border bg-card/80"}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{name}</CardTitle>
          {featured && <Badge className="rounded-full">Popular</Badge>}
        </div>
        <div>
          <p className="text-4xl font-semibold tracking-tight">{price}</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-3 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>{feature}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button className="w-full rounded-full" variant={featured ? "default" : "outline"}>
          Choose plan
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-secondary/45 px-6 py-20 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="max-w-2xl space-y-3">
          <Badge variant="secondary" className="rounded-full">Pricing</Badge>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Simple pricing that grows with your team
          </h2>
          <p className="text-lg leading-8 text-muted-foreground">
            Start free, upgrade when the whole team is on board. No hidden fees.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {tiers.map((tier) => (
            <PricingCard key={tier.name} {...tier} />
          ))}
        </div>
      </div>
    </section>
  );
}
