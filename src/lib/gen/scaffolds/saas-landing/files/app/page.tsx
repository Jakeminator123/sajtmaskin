import { Badge } from "@/components/ui/badge";
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
    description: "Keep owners, blockers, and priorities in one product-shaped workspace.",
    icon: Workflow,
  },
  {
    title: "Operational visibility",
    description: "Show metrics and progress close to the workflow instead of in separate reports.",
    icon: BarChart3,
  },
  {
    title: "Security by default",
    description: "Talk about permissions, roles, and trust in a way that fits a real SaaS.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "What kind of SaaS prompts is this best for?",
    answer: "Use it for B2B SaaS, workflow tools, analytics products, and software with pricing-led positioning.",
  },
  {
    question: "Does it support pricing and upgrade sections?",
    answer: "Yes. Pricing, product positioning, and CTA structure are already included.",
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
                Built for software products that need product narrative, pricing, trust, and a dashboard-shaped hero.
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
                { label: "Launch speed", value: "Fast" },
                { label: "Ready sections", value: "Hero + pricing + FAQ" },
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
                  { label: "Retention", value: "92%" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl border bg-secondary/75 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-xl font-semibold">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border bg-background/85 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Weekly pipeline</p>
                    <p className="text-xs text-muted-foreground">Product snapshot</p>
                  </div>
                  <Badge variant="outline" className="rounded-full">+12.4%</Badge>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    "Role-aware permissions",
                    "Fast onboarding flows",
                    "Pricing-led conversion design",
                    "Clear product hierarchy",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 rounded-2xl bg-secondary/70 px-4 py-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
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
              SaaS launch structure without dragging in backend or logged-in app complexity.
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
              Keep the structure and swap names, limits, and CTA logic to fit the product.
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
              Use this to handle objections and product questions early.
            </p>
          </div>
          <Card className="rounded-[1.8rem] border bg-card/80 p-2">
            <CardContent className="p-3">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((item, index) => (
                  <AccordionItem key={item.question} value={`item-${index}`}>
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
