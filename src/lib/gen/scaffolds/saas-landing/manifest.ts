import type { ScaffoldManifest } from "../types";

export const saasLandingManifest: ScaffoldManifest = {
  id: "saas-landing",
  family: "saas-landing",
  label: "SaaS Landing",
  description:
    "Product-led marketing starter with feature narrative, dashboard preview, pricing, FAQ, and conversion-ready sections.",
  buildIntents: ["website", "template"],
  tags: [
    "saas",
    "software",
    "platform",
    "pricing",
    "subscription",
    "dashboard",
    "product",
    "b2b",
  ],
  promptHints: [
    "Use this scaffold when the prompt is clearly about software, subscriptions, dashboards, or B2B products.",
    "Keep the product narrative: problem, product value, feature panels, pricing, FAQ, and final CTA.",
    "The right-side hero card is a product preview slot and should stay visually product-led.",
  ],
  files: [
    {
      path: "app/globals.css",
      content: `@import "tailwindcss";

@theme inline {
  --color-background: oklch(0.145 0.005 250);
  --color-foreground: oklch(0.97 0.003 250);
  --color-card: oklch(0.19 0.005 250);
  --color-card-foreground: oklch(0.97 0.003 250);
  --color-primary: oklch(0.72 0.16 150);
  --color-primary-foreground: oklch(0.14 0.004 150);
  --color-secondary: oklch(0.23 0.005 250);
  --color-secondary-foreground: oklch(0.95 0.003 250);
  --color-muted: oklch(0.22 0.005 250);
  --color-muted-foreground: oklch(0.72 0.01 250);
  --color-accent: oklch(0.24 0.01 250);
  --color-accent-foreground: oklch(0.95 0.003 250);
  --color-border: oklch(0.28 0.005 250);
  --color-ring: oklch(0.72 0.16 150);
  --radius: 0.95rem;
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    background-image:
      radial-gradient(circle at top center, color-mix(in oklab, var(--color-primary) 16%, transparent) 0%, transparent 30%),
      linear-gradient(to bottom, color-mix(in oklab, var(--color-accent) 28%, transparent) 0%, transparent 20%);
  }
}
`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingFooter } from "@/components/marketing-footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "SaaS Landing Starter",
  description: "A product-led SaaS marketing starter with pricing, product preview, and FAQ.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        <MarketingHeader />
        <main>{children}</main>
        <MarketingFooter />
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/page.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck, Workflow } from "lucide-react";
import { PricingCard } from "@/components/pricing-card";

const features = [
  {
    title: "One shared workspace",
    description: "Give every team a clear view of projects, owners, blockers, and priorities without duct-taping dashboards together.",
    icon: Workflow,
  },
  {
    title: "Operational visibility",
    description: "Keep metrics, activity, and decision-making close to the workflow with snapshots that feel like a real product.",
    icon: BarChart3,
  },
  {
    title: "Security by default",
    description: "Use trustworthy language around permissions, roles, and team access instead of sounding like a generic landing page.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "What kind of SaaS prompts is this best for?",
    answer: "Use it for B2B products, workflow tools, analytics platforms, membership products, and software with pricing-led positioning.",
  },
  {
    question: "Does it support pricing and upgrade sections?",
    answer: "Yes. The scaffold already includes pricing cards, product positioning, and CTA structure so the model can adapt them to the user prompt.",
  },
  {
    question: "Should this become a full dashboard starter?",
    answer: "Not yet. This is the marketing-facing layer. A future dashboard scaffold should handle the logged-in app area separately.",
  },
];

export default function HomePage() {
  return (
    <div className="pb-10">
      <section className="px-6 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-8">
            <Badge className="rounded-full bg-primary/15 px-3 py-1 text-primary hover:bg-primary/15">
              SaaS product starter
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                Turn a product idea into a sharper SaaS launch page.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                This starter is designed for software products that need a stronger first impression:
                product narrative, feature positioning, pricing, trust signals, and a dashboard-shaped hero.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                Start free trial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                Watch product tour
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Implementation time", value: "Fast" },
                { label: "Core pages ready", value: "Hero + pricing + FAQ" },
                { label: "Best fit", value: "B2B SaaS" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border bg-card/70 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="overflow-hidden rounded-4xl border-primary/20 bg-card/90 shadow-2xl shadow-primary/10">
            <CardHeader className="border-b bg-background/40 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Operations overview</p>
                  <p className="text-sm text-muted-foreground">Live product preview slot</p>
                </div>
                <Badge variant="secondary" className="rounded-full">Q2 growth</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "MRR", value: "$84k" },
                  { label: "Activation", value: "68%" },
                  { label: "Time saved", value: "14h/w" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border bg-secondary/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border bg-background/85 p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Weekly pipeline</p>
                    <p className="text-xs text-muted-foreground">Product-style chart placeholder</p>
                  </div>
                  <Badge variant="outline" className="rounded-full">+12.4%</Badge>
                </div>
                <div className="flex h-48 items-end gap-2">
                  {[42, 55, 48, 64, 72, 68, 84, 78, 88, 94].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-full bg-linear-to-t from-primary/55 to-primary" style={{ height: \`\${height}%\` }} />
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {["Role-aware permissions", "Fast onboarding flows", "Pricing-led conversion design", "Clear product hierarchy"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="features" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Feature framing</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">A stronger starting point for product marketing</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Inspired by SaaS launch pages, but distilled down so the model gets strong structure without inheriting backend complexity.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="rounded-[1.6rem] border bg-card/80">
                <CardHeader className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-secondary/45 px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Pricing</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Built-in pricing section for subscription products</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Keep the pricing structure and replace the names, limits, and CTA logic to match the user's product.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <PricingCard
              name="Starter"
              price="$29"
              description="For small teams validating the workflow."
              features={["3 team members", "Core automations", "Weekly reports"]}
            />
            <PricingCard
              name="Growth"
              price="$89"
              description="For teams scaling operations across multiple workstreams."
              features={["Unlimited projects", "Priority support", "Advanced analytics"]}
              featured
            />
            <PricingCard
              name="Scale"
              price="Custom"
              description="For larger teams with roles, governance, and rollout needs."
              features={["SSO / SAML", "Advanced permissions", "Dedicated onboarding"]}
            />
          </div>
        </div>
      </section>

      <section id="faq" className="px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">FAQ</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Ready-made FAQ block</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              A SaaS prompt often needs objections handled early. This section gives the model a clear place for that.
            </p>
          </div>
          <Card className="rounded-[1.8rem] border bg-card/80 p-2">
            <CardContent className="p-3">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((item, index) => (
                  <AccordionItem key={item.question} value={\`item-\${index}\`}>
                    <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                    <AccordionContent className="text-sm leading-7 text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
`,
    },
    {
      path: "components/marketing-header.tsx",
      content: `"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          Orbit OS
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" variant="outline" className="rounded-full">Book demo</Button>
          <Button size="sm" className="rounded-full">Start free</Button>
        </nav>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="border-t bg-background px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <Button variant="outline" className="mt-2 rounded-full">Book demo</Button>
            <Button className="rounded-full">Start free</Button>
          </div>
        </div>
      )}
    </header>
  );
}
`,
    },
    {
      path: "components/pricing-card.tsx",
      content: `import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

type PricingCardProps = {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
};

export function PricingCard({
  name,
  price,
  description,
  features,
  featured = false,
}: PricingCardProps) {
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
`,
    },
    {
      path: "components/marketing-footer.tsx",
      content: `const links = {
  Product: ["Features", "Pricing", "Integrations"],
  Company: ["About", "Customers", "Contact"],
  Resources: ["Docs", "Guides", "Changelog"],
};

export function MarketingFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/75 p-8 lg:grid-cols-[1.15fr_0.8fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">Orbit OS</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            Product-led SaaS starter for sharper launches, clearer pricing, and a stronger marketing baseline.
          </p>
        </div>
        {Object.entries(links).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((item) => (
                <a key={item} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {item}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}
`,
    },
  ],
};
