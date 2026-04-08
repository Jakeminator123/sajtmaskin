import { ArrowRight, CheckCircle2 } from "lucide-react"
import Link from "next/link";






import { pricingFaqs, pricingPlans } from "@/lib/site-data";
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
  title:
    "Pricing — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Explore pricing packages from TechPartner AB for development, cloud and security support. Compare levels and choose the right starting point.",
  keywords: [
    "pricing tech partner",
    "IT consulting packages",
    "cloud architecture pricing",
    "security advisory pricing",
    "techpartner ab plans",
  ],
});

export default function PricingPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Badge variant="secondary">Pricing</Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Flexible package levels for growing technical needs
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            Choose the level that fits your current capacity and priorities. Every package is designed to deliver practical progress while maintaining clear governance and quality.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 xl:grid-cols-3">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
                  plan.highlighted ? "border-primary shadow-lg" : ""
                }`}
              >
                <CardHeader className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">{plan.name}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.suitability}</p>
                    </div>
                    {plan.highlighted ? <Badge>Mest vald</Badge> : null}
                  </div>

                  <div>
                    <p className="text-4xl font-bold tracking-tight">{plan.price}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <span className="text-sm leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button asChild className="w-full active:scale-95 transition-all duration-200" variant={plan.highlighted ? "default" : "outline"}>
                    <Link href="/contact">
                      {plan.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline">What is included</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              A predictable collaboration model from week one
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Every package includes structured follow-up, clear ownership, and practical recommendations that can be turned into action quickly. This gives both leadership and technical teams a better foundation for decisions.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              "Clear prioritization and planning cadence",
              "Senior guidance in architecture and delivery choices",
              "Ongoing risk and security perspective",
              "Transparent reporting and next-step recommendations",
            ].map((item) => (
              <div key={item} className="rounded-[1.25rem] border border-border bg-card p-4 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline">FAQ</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Common pricing questions
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              If you are uncertain about package level, contract form, or support scope, these are the questions we most often address before kickoff.
            </p>
          </div>

          <div className="space-y-4">
            {pricingFaqs.map((faq) => (
              <Card key={faq.question} className="border-border bg-card shadow-sm">
                <CardHeader>
                  <h3 className="text-lg font-semibold tracking-tight">{faq.question}</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}