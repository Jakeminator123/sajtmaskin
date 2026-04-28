"use client";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LucideIcon, ArrowRight, Target, TimerReset, Trophy } from "lucide-react";
import { useRef } from "react";
import { Gamepad as Gamepad2, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, } from "@/components/ui/card";
import BurgerGame from "@/components/burger-game";
import PointerParallaxLayer from "@/components/pointer-parallax-layer";
import ScrollParallaxLayer from "@/components/scroll-parallax-layer";
type Benefit = {
    icon: LucideIcon;
    title: string;
    text: string;
};
const benefits: Benefit[] = [
    {
        icon: Trophy,
        title: "Minnesvärd upplevelse",
        text: "Spelet gör att restaurangen känns levande även när du klickar runt hemifrån.",
    },
    {
        icon: TimerReset,
        title: "Snabba rundor",
        text: "30 sekunder gör spelet enkelt att förstå, lätt att testa och roligt att starta om.",
    },
    {
        icon: Sparkles,
        title: "Passar vår ton",
        text: "Lekfullt, färgstarkt och tydligt brandat — precis som Glöd Burger Club.",
    },
];
const faqItems = [
    {
        question: "Hur styr jag spelet?",
        answer: "Använd vänster- och högerknapparna på skärmen, eller piltangenterna om du spelar på dator. Enter eller mellanslag startar en ny runda.",
    },
    {
        question: "Hur får jag poäng?",
        answer: "Varje ingrediens du fångar ger 10 poäng. Missar du en ingrediens faller den bort och du får vänta på nästa.",
    },
    {
        question: "Fungerar spelet på mobil?",
        answer: "Ja. Spelytan är responsiv och har touch-anpassade kontroller, så du kan spela lika lätt på mobil som på desktop.",
    },
    {
        question: "Sparar spelet mitt rekord?",
        answer: "Ja, high score sparas lokalt i webbläsaren på din enhet så du kan försöka slå ditt personliga rekord nästa gång.",
    },
];
export default function GamePage() {
    const heroRef = useRef<HTMLElement>(null);
    return (<>
      <section ref={heroRef} className="relative overflow-hidden border-b border-border/60 pb-14 pt-16 sm:pb-18 sm:pt-20 lg:pb-20 lg:pt-24">
        <ScrollParallaxLayer targetRef={heroRef} translateYRange={[-10, 12]} opacityRange={[0.18, 0.12]} className="pointer-events-none absolute inset-0">
          <Image src="https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1800&q=80" alt="" aria-hidden="true" fill unoptimized sizes="100vw" className="object-cover saturate-125"/>
        </ScrollParallaxLayer>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_25%,transparent)_0%,color-mix(in_oklab,var(--background)_78%,transparent)_38%,var(--background)_100%)]"/>
        <div className="pointer-events-none absolute inset-0 grid-lines opacity-70"/>
        <div className="pointer-events-none absolute left-10 top-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl"/>
        <div className="pointer-events-none absolute right-10 top-1/4 h-52 w-52 rounded-full bg-accent/15 blur-3xl"/>

        <div className="section-shell relative">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-6">
              <Badge className="rounded-full bg-primary/10 px-4 py-1.5 text-primary hover:bg-primary/10">
                Hamburgerspel
              </Badge>
              <div className="space-y-4">
                <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
                  Bygg din burgare innan tiden går ut.
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Ett enkelt, snabbt och färgstarkt spel som fångar Glöds
                  lekfulla sida. Perfekt när du vill ha en liten challenge innan
                  nästa riktiga burgerkväll.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
                  <a href="#spelplan">
                    Starta spelet
                    <Gamepad2 className="ml-2 h-4 w-4"/>
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-border/70 bg-background/80 px-7 active:scale-95">
                  <Link href="/">
                    Till restaurangen
                    <ArrowRight className="ml-2 h-4 w-4"/>
                  </Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">Runda</p>
                  <p className="mt-2 text-2xl font-semibold text-primary">
                    30 sek
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">
                    Kontroller
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    touch + pilar
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium text-foreground">
                    Målbild
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-accent-foreground">
                    180+
                  </p>
                </div>
              </div>
            </div>

            <div className="[perspective:1600px]">
              <PointerParallaxLayer targetRef={heroRef} intensity={10} rotateIntensity={3} className="relative">
                <Card className="surface-panel rounded-[2rem] border-border/80">
                  <CardHeader className="space-y-4">
                    <Badge variant="outline" className="w-fit rounded-full border-border/70 bg-card/80">
                      Så funkar det
                    </Badge>
                    <CardTitle className="font-display text-3xl tracking-tight">
                      Tre snabba steg
                    </CardTitle>
                    <CardDescription className="text-base leading-relaxed text-muted-foreground">
                      Fånga ingredienser, bygg poäng och kör en runda till om du
                      vill slå ditt high score.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        1. Starta rundan
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Klicka på starta och håll blicken på de fallande
                        ingredienserna.
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        2. Fånga rätt i tid
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Flytta burgaren längst ner och plocka upp så mycket du
                        kan.
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        3. Jaga rekordet
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        Resultatet sparas lokalt så du alltid har något att slå.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </PointerParallaxLayer>
            </div>
          </div>
        </div>
      </section>

      <section id="spelplan" className="section-padding">
        <div className="section-shell grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <BurgerGame />

          <div className="space-y-6">
            <Card className="surface-panel rounded-[2rem] border-border/80">
              <CardHeader>
                <Badge className="w-fit rounded-full bg-accent/25 px-4 py-1.5 text-accent-foreground hover:bg-accent/25">
                  Varför spela?
                </Badge>
                <CardTitle className="font-display text-3xl tracking-tight">
                  En liten brandupplevelse med stor personlighet.
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {benefits.map((item) => {
            const Icon = item.icon;
            return (<div key={item.title} className="rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-4 w-4"/>
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {item.text}
                          </p>
                        </div>
                      </div>
                    </div>);
        })}
              </CardContent>
            </Card>

            <Card className="surface-panel rounded-[2rem] border-border/80">
              <CardHeader>
                <Badge variant="outline" className="w-fit rounded-full border-border/70 bg-card/80">
                  Tips för högre score
                </Badge>
                <CardTitle className="text-2xl text-foreground">
                  Spela smart
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                  <Target className="mt-0.5 h-4 w-4 text-primary"/>
                  <p>
                    Stå nära mitten i början av rundan så når du fler banor
                    snabbare.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                  <TimerReset className="mt-0.5 h-4 w-4 text-primary"/>
                  <p>
                    Tryck starta igen direkt om du vill jaga rekordet utan att
                    lämna sidan.
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-[1.25rem] border border-border/70 bg-card/80 p-4">
                  <Trophy className="mt-0.5 h-4 w-4 text-primary"/>
                  <p>
                    180 poäng eller mer är en riktigt bra runda för första
                    försöket.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section-padding bg-card/55">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-4">
            <Badge className="rounded-full bg-secondary/60 px-4 py-1.5 text-secondary-foreground hover:bg-secondary/60">
              FAQ
            </Badge>
            <h2 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
              Så funkar det — snabbt och tydligt.
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Nya spelare ska förstå allt direkt. Därför är reglerna enkla,
              rundorna korta och omstarten bara ett klick bort.
            </p>
          </div>

          <Card className="surface-panel rounded-[2rem] border-border/80">
            <CardContent className="p-6">
              <Accordion type="single" collapsible className="w-full">
                {faqItems.map((item, index) => (<AccordionItem key={item.question} value={`item-${index}`} className="border-border/70">
                    <AccordionTrigger className="text-left text-base font-medium text-foreground">
                      {item.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="section-padding">
        <div className="section-shell">
          <Card className="surface-panel-strong overflow-hidden rounded-[2rem] border-border/80">
            <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="p-6 sm:p-8 lg:p-10">
                <Badge className="rounded-full bg-card/85 px-4 py-1.5 text-foreground hover:bg-card/85">
                  Klar för en riktig burgare?
                </Badge>
                <h2 className="mt-4 font-display text-4xl tracking-tight text-balance sm:text-5xl">
                  Nu när du har värmt upp tummarna är det dags att besöka Glöd.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Gå tillbaka till restaurangsidan för att hitta öppettider,
                  adress och hela känslan bakom Glöd Burger Club.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="rounded-full px-6 active:scale-95">
                    <Link href="/">
                      Till Om oss
                      <ArrowRight className="ml-2 h-4 w-4"/>
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full border-border/70 bg-background/80 px-6 active:scale-95">
                    <Link href="/om">Läs bakom grillen</Link>
                  </Button>
                </div>
              </div>

              <div className="relative min-h-[18rem]">
                <Image src="https://images.unsplash.com/photo-1550317138-10000687a72b?auto=format&fit=crop&w=1400&q=80" alt="Burgare med färska ingredienser och modern servering" fill unoptimized sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover"/>
                <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-foreground/35"/>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </>);
}
