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
    title: "En gemensam arbetsyta",
    description: "Samla ägare, hinder och prioriteringar i en produktformad arbetsyta.",
    icon: Workflow,
  },
  {
    title: "Operativ översikt",
    description: "Visa mätetal och framsteg nära arbetsflödet i stället för i separata rapporter.",
    icon: BarChart3,
  },
  {
    title: "Säkerhet som standard",
    description: "Prata om behörigheter, roller och förtroende på ett sätt som passar en riktig SaaS.",
    icon: ShieldCheck,
  },
];

const faqs = [
  {
    question: "Vilka typer av SaaS-prompter passar den här bäst för?",
    answer: "Använd den för B2B-SaaS, arbetsflödesverktyg, analysprodukter och mjukvara med prisdriven positionering.",
  },
  {
    question: "Stöder den pris- och uppgraderingssektioner?",
    answer: "Ja. Priser, produktpositionering och CTA-struktur ingår redan.",
  },
  {
    question: "Ska den bli en fullständig dashboard-start?",
    answer: "Inte än. Det här är marknadsföringslagret. En framtida dashboard-scaffold ska hantera den inloggade appen separat.",
  },
];

export default function HomePage() {
  return (
    <div className="pb-10">
      <section className="px-6 py-20 sm:px-8 lg:py-28">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-12 text-center">
          <div className="space-y-8">
            <Badge className="rounded-full bg-primary/15 px-3 py-1 text-primary hover:bg-primary/15">
              SaaS-produktstart
            </Badge>
            <div className="space-y-5">
              <h1 className="mx-auto max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                Förvandla en produktidé till en skarpare SaaS-lanseringssida.
              </h1>
              <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Byggd för mjukvaruprodukter som behöver produktberättelse, priser, förtroende och en dashboard-formad hero.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                Starta gratis trial <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                Se produktvisning
              </Button>
            </div>
            <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-3">
              {[
                { label: "Lanseringstempo", value: "Snabbt" },
                { label: "Klara sektioner", value: "Hero + priser + FAQ" },
                { label: "Bäst för", value: "B2B-SaaS" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border bg-card/70 p-4 text-left">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <Card className="w-full overflow-hidden rounded-4xl border-primary/20 bg-card/90 text-left shadow-2xl shadow-primary/10">
            <CardHeader className="border-b bg-background/40 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Operativ översikt</p>
                  <p className="text-sm text-muted-foreground">Live förhandsvisning av produkten</p>
                </div>
                <Badge variant="secondary" className="rounded-full">Q2-tillväxt</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "MRR", value: "840 kkr" },
                  { label: "Aktivering", value: "68%" },
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
                    <p className="text-sm font-medium">Veckopipeline</p>
                    <p className="text-xs text-muted-foreground">Produktsnapshot</p>
                  </div>
                  <Badge variant="outline" className="rounded-full">+12,4%</Badge>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    "Rollbaserade behörigheter",
                    "Snabba onboarding-flöden",
                    "Prisdriven konverteringsdesign",
                    "Tydlig produkthierarki",
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
            <Badge variant="secondary" className="rounded-full">Funktioner</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">En starkare startpunkt för produktmarknadsföring</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              SaaS-lanseringsstruktur utan backend- eller inloggad app-komplexitet.
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
            <Badge variant="secondary" className="rounded-full">Priser</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Inbyggd prissektion för prenumerationsprodukter</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Behåll strukturen och byt namn, gränser och CTA-logik så det passar produkten.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <PricingCard
              name="Starter"
              price="290 kr"
              description="För små team som validerar arbetsflödet."
              features={["3 teammedlemmar", "Grundläggande automationer", "Veckorapporter"]}
            />
            <PricingCard
              name="Growth"
              price="890 kr"
              description="För team som skalar driften över flera arbetsströmmar."
              features={["Obegränsade projekt", "Prioriterad support", "Avancerad analys"]}
              featured
            />
            <PricingCard
              name="Scale"
              price="Anpassat"
              description="För större team med roller, styrning och utrullningsbehov."
              features={["SSO / SAML", "Avancerade behörigheter", "Dedikerad onboarding"]}
            />
          </div>
        </div>
      </section>

      <section id="faq" className="px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">FAQ</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Färdig FAQ-sektion</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Använd den för att bemöta invändningar och produktfrågor tidigt.
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
