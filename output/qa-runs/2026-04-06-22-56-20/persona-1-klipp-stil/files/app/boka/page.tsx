
import type { Metadata } from "next";


import { Clock, MessageSquareText, Scissors, Sparkles } from "lucide-react";



import { BookingForm } from "@/components/booking-form";

import { openingHours, services, siteInfo } from "@/lib/site-data";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = {
  title: "Klipp & Stil — Boka tid online för klippning, färgning och styling",
  description:
    "Skicka din bokningsförfrågan till Klipp & Stil i Göteborg. Välj behandling, datum och tid för klippning, färgning, styling eller skäggvård.",
  keywords: [
    "boka frisör Göteborg",
    "boka klippning Göteborg",
    "boka färgning Göteborg",
    "onlinebokning frisör Göteborg",
    "Klipp & Stil boka",
  ],
  openGraph: {
    title: "Klipp & Stil — Boka tid online för klippning, färgning och styling",
    description:
      "Skicka din bokningsförfrågan till Klipp & Stil i Göteborg. Välj behandling, datum och tid för klippning, färgning, styling eller skäggvård.",
    locale: "sv_SE",
    type: "website",
  },
};

const steps = [
  {
    title: "Berätta vad du vill göra",
    description:
      "Välj behandling och skriv gärna några ord om hur du tänker kring längd, färg eller styling. Ju mer vi vet, desto bättre kan vi matcha dig med rätt tid och rätt person.",
    icon: MessageSquareText,
  },
  {
    title: "Välj datum och tid",
    description:
      "Du skickar in en bokningsförfrågan med önskat datum och klockslag. Om tiden inte längre är ledig återkommer vi snabbt med det närmaste alternativet.",
    icon: Clock,
  },
  {
    title: "Få bekräftelse från salongen",
    description:
      "När vi tagit emot din förfrågan hör vi av oss för att bekräfta eller justera bokningen. Målet är att du ska känna dig trygg redan innan du kommer in genom dörren.",
    icon: Scissors,
  },
];

const visitTips = [
  {
    title: "Ta gärna med inspiration",
    description:
      "Om du har bilder, färgidéer eller tidigare resultat du trivts med får du gärna visa dem. Det gör konsultationen tydligare och hjälper oss att förstå känslan du är ute efter.",
  },
  {
    title: "Var ärlig med vardagen",
    description:
      "Berätta hur mycket tid du vill lägga på styling och vilka produkter du brukar använda. Då kan vi rekommendera en nivå på klippning eller färg som verkligen fungerar för dig.",
  },
  {
    title: "Avbokning senast 24 timmar innan",
    description:
      "Behöver du ändra din tid ber vi dig att meddela oss så snart du kan. Då kan vi hjälpa dig vidare till en ny tid och samtidigt erbjuda din plats till någon annan.",
  },
];

export default function BookingPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="flex flex-col justify-center gap-6">
            <Badge
              variant="secondary"
              className="w-fit rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
            >
              Boka tid
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Skicka din bokningsförfrågan online när det passar dig
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Använd formuläret för att skicka din bokningsförfrågan så
                återkommer vi med en bekräftelse. Är du osäker på vilken
                behandling som passar bäst hjälper vi dig gärna att välja rätt
                innan besöket, så att tiden blir avsatt på bästa sätt.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <Image
              src="/placeholder.svg?height=850&width=1000&text=Frisör+som+förbereder+verktyg+inför+bokad+kund+i+varm+salong"
              alt="Frisör som förbereder verktyg inför bokad kund i varm salong"
              width={1000}
              height={850}
              priority
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Så fungerar det"
            title="Tre enkla steg från förfrågan till bekräftad tid"
            description="Vi vill att bokningen ska kännas tydlig och trygg, särskilt om du planerar en större förändring. Därför återkommer vi alltid med personlig bekräftelse i stället för att låta dig gissa vilken behandling som passar bäst."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <Card key={step.title} className="rounded-[2rem] border-border bg-card shadow-sm">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {step.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Formulär"
            title="Berätta vad du vill göra så återkommer vi snabbt"
            description="Fyll i dina uppgifter, önskat datum och vilken behandling du är intresserad av. Skriv gärna några rader om du funderar på en större färgförändring eller vill kombinera flera moment under samma besök."
          />

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="rounded-[2rem] border-border bg-card shadow-lg">
              <CardContent className="p-6 sm:p-8">
                <BookingForm />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Bra att veta
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {siteInfo.bookingResponse} Om du tvekar mellan två
                    behandlingar räcker det att du beskriver din idé i formuläret,
                    så hjälper vi dig att välja rätt upplägg.
                  </p>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <h3 className="text-xl font-semibold">Öppettider</h3>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {openingHours.map((item) => (
                      <div key={item.label} className="flex justify-between gap-4">
                        <span>{item.label}</span>
                        <span className="font-medium text-foreground">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <h3 className="text-xl font-semibold">Vanliga val</h3>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    {services.map((service) => (
                      <li key={service.id} className="flex items-start justify-between gap-4">
                        <span>{service.name}</span>
                        <span className="font-medium text-foreground">
                          {service.price}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Inför besöket"
            title="Några saker som gör upplevelsen ännu bättre"
            description="Ju mer vi vet om din vardag och dina förväntningar, desto bättre kan vi forma ett resultat som känns rätt även när du kommer hem. Små detaljer gör ofta stor skillnad."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {visitTips.map((tip) => (
              <Card key={tip.title} className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {tip.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {tip.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}