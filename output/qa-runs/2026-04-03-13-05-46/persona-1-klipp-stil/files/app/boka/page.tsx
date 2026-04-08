
import type { Metadata } from "next";


import { CalendarDays, Mail, MapPin, Phone } from "lucide-react";



import { BookingForm } from "@/components/booking-form";

import { createPageMetadata, siteConfig } from "@/lib/site";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createPageMetadata({
  title: "Boka tid",
  path: "/boka",
  description:
    "Skicka din bokningsförfrågan till Klipp & Stil i Göteborg. Välj datum, tid och tjänst online så återkommer vi snabbt med bekräftelse.",
});

type Step = {
  title: string;
  description: string;
};

const steps: Step[] = [
  {
    title: "Skicka din förfrågan",
    description:
      "Fyll i namn, kontaktuppgifter, datum och tid som passar dig. Skriv gärna några ord om vad du vill göra så att vi kan förbereda oss på rätt sätt.",
  },
  {
    title: "Vi bekräftar upplägget",
    description:
      "När vi fått din bokning återkommer vi via e-post eller telefon. Om vi behöver justera tid eller behandling berättar vi det tydligt innan vi låser din bokning.",
  },
  {
    title: "Besök med konsultation",
    description:
      "På plats börjar vi med en kort avstämning där vi går igenom mål, hårkvalitet och förväntningar. Det gör att behandlingen känns trygg och genomtänkt redan från start.",
  },
];

export default function BookingPage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Boka tid
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Skicka din bokningsförfrågan online
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Boka din tid online genom att fylla i uppgifterna nedan. Skriv gärna vad du vill göra, till exempel klippning, slingor eller skäggtrim, så kan vi förbereda oss och avsätta rätt tid för ditt besök.
              </p>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground">
                Du får en bekräftelse efter att du skickat in din förfrågan. Om du behöver snabb hjälp eller vill stämma av något innan bokning går det alltid bra att ringa eller mejla oss.
              </p>
            </div>
          </div>

          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
                alt="Konsultation mellan frisör och kund i ljus salong"
                width={1100}
                height={900}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="section-shell p-6 sm:p-8">
            <SectionHeading
              eyebrow="Bokningsformulär"
              title="Fyll i dina uppgifter så återkommer vi med bekräftelse"
              description="Vi använder din information för att matcha rätt behandling, avsätta rätt tid och kunna återkomma med bekräftelse. Ju tydligare du beskriver vad du vill göra, desto bättre kan vi förbereda ditt besök."
            />
            <div className="mt-8">
              <BookingForm />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
              <CardContent className="space-y-5 p-6">
                <h2 className="text-2xl font-semibold">Bra att skriva med i bokningen</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Vill du boka färg är det hjälpsamt om du beskriver ditt utgångsläge, ungefärlig längd och om du har färgat tidigare. Då kan vi snabbare avgöra hur mycket tid som behövs och om ett särskilt upplägg passar bättre.
                </p>
                <div className="rounded-[1.5rem] border border-border/70 bg-muted/60 p-4">
                  <p className="text-sm leading-7 text-muted-foreground">
                    Exempel: “Jag vill fräscha upp längderna med mjuka slingor. Håret är axellångt och färgades senast i höstas.”
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
              <CardContent className="space-y-4 p-6">
                <h2 className="text-2xl font-semibold">Behöver du hjälp att välja tjänst?</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Vi hjälper dig gärna hitta rätt upplägg och tidslängd om du är osäker. Hör av dig så guidar vi dig vidare innan du bokar, eller skriv din fråga direkt i formuläret.
                </p>

                <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                  <p className="flex items-start gap-3">
                    <Phone className="mt-1 h-4 w-4 text-accent" />
                    <a href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`} className="transition-colors hover:text-foreground">
                      {siteConfig.phone}
                    </a>
                  </p>
                  <p className="flex items-start gap-3">
                    <Mail className="mt-1 h-4 w-4 text-accent" />
                    <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-foreground">
                      {siteConfig.email}
                    </a>
                  </p>
                  <p className="flex items-start gap-3">
                    <MapPin className="mt-1 h-4 w-4 text-accent" />
                    <span>
                      {siteConfig.address.street}, {siteConfig.address.postalCode} {siteConfig.address.city}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Så går det till"
            title="Tre enkla steg från bokning till färdigt besök"
            description="Vi har gjort bokningen så enkel som möjligt utan att tumma på tydligheten. Målet är att du redan innan ditt besök ska veta hur processen ser ut och känna att det är lätt att få kontakt om något behöver justeras."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {steps.map((step, index) => (
              <Card key={step.title} className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/25 text-primary">
                    <span className="text-lg font-semibold">{index + 1}</span>
                  </div>
                  <h2 className="text-xl font-semibold">{step.title}</h2>
                  <p className="text-sm leading-7 text-muted-foreground">{step.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=950&h=850&fit=crop&q=80"
                alt="Detaljbild med verktyg och handduk i salongsmiljö"
                width={950}
                height={850}
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading
              eyebrow="Praktisk information"
              title="Boka när det passar dig – vi återkommer inom kort"
              description="Vi bekräftar bokningsförfrågningar så snart vi kan och försöker alltid vara tydliga om tid, behandling och nästa steg. Om du vill komma snabbt eller behöver hjälp samma dag är telefon ofta det bästa alternativet."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="muted-shell p-5">
                <CalendarDays className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-lg font-semibold">Bekräftelse efter inskickat formulär</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  När du skickar in din bokning ser du en bekräftelse direkt på sidan. Därefter hör vi av oss för att säkerställa tid och upplägg.
                </p>
              </div>
              <div className="muted-shell p-5">
                <Phone className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-lg font-semibold">Snabb kontakt vid behov</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Har du bråttom eller undrar över en akut justering går det fint att ringa oss. Vi hjälper dig gärna hitta en lösning.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}