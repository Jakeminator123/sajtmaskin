
import type { Metadata } from "next";

import { Clock3, GithubIcon as Github, Linkedin, Mail, MapPin, PhoneCall } from "lucide-react";

import { ContactForm } from "@/components/contact-form";
import Image from "next/image";
import { siteConfig } from "@/lib/site-data";
import { createMetadata } from "@/lib/seo";
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"






export const metadata: Metadata = createMetadata({
  title: "Kontakt",
  description:
    "Kontakta TechPartner AB för ett första samtal om systemutveckling, molnlösningar eller IT-säkerhet. Vi svarar vanligtvis inom en arbetsdag.",
  path: "/kontakt",
});

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      <section className="pb-16 pt-10 sm:pb-24 sm:pt-16 lg:pb-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:items-center">
          <div className="space-y-8">
            <Badge
              variant="secondary"
              className="rounded-full border border-border/80 bg-card px-4 py-1.5 text-sm text-secondary-foreground"
            >
              Kontakta oss
            </Badge>
            <div className="space-y-6">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Berätta vad ni vill uppnå så återkommer vi med nästa steg
              </h1>
              <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Beskriv ert nuläge, mål eller en konkret utmaning så förbereder
                vi ett relevant svar. Vanligtvis återkommer vi inom en arbetsdag
                med ett tydligt förslag på hur vi kan ta dialogen vidare.
              </p>
            </div>
          </div>

          <div className="surface-panel grid-mask overflow-hidden rounded-[2rem] shadow-xl">
            <div className="relative aspect-[5/4]">
              <Image
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1100&h=800&fit=crop&q=80"
                alt="Kontorsentré och besöksmiljö i skandinavisk stil"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 50vw, 100vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:items-start">
          <div className="space-y-8">
            <SectionHeading
              label="Kontaktformulär"
              title="Skicka en förfrågan"
              description="Fyll i formuläret så återkommer vi med nästa steg, rekommenderad startpunkt och vilka personer som bör vara med i första mötet. Ju tydligare nuläge ni beskriver, desto bättre kan vi förbereda ett relevant svar."
            />
            <ContactForm />
          </div>

          <div className="space-y-4">
            <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Direktkontakt</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <PhoneCall className="mt-0.5 h-4 w-4 text-primary" />
                  <a
                    href={siteConfig.phoneHref}
                    className="transition-colors hover:text-foreground"
                  >
                    {siteConfig.phoneDisplay}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 text-primary" />
                  <a
                    href={siteConfig.emailHref}
                    className="transition-colors hover:text-foreground"
                  >
                    {siteConfig.email}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                  <a
                    href={siteConfig.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-foreground"
                  >
                    {siteConfig.address}
                  </a>
                </div>
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
                  <p>{siteConfig.hours}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Bra att veta inför första mötet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Om ni redan vet vilka system, team eller beroenden som är
                  viktigast får ni gärna skriva det i meddelandet. Det hjälper
                  oss att förbereda rätt personer och ställa bättre frågor.
                </p>
                <p>
                  Boka gärna tid innan besök så att rätt person är på plats och
                  kan avsätta tillräckligt med tid för ert ärende.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8 lg:items-start">
          <div className="space-y-8">
            <SectionHeading
              label="Besöksadress och karta"
              title="Hitta till oss eller ta mötet digitalt"
              description="Vi tar gärna möten på plats i Göteborg eller digitalt om det passar ert team bättre. Många av våra uppdrag sker med företag i Stockholm, så arbetssättet är anpassat för att fungera smidigt oavsett plats."
            />
            <div className="surface-panel overflow-hidden rounded-[2rem] shadow-xl">
              <a
                href={siteConfig.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <div className="relative aspect-[5/4]">
                  <Image
                    src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=800&fit=crop&q=80"
                    alt="Statisk karta över Storgatan 12 i Göteborg med kontorsläge"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                  />
                </div>
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">Följ oss</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <a
                  href={siteConfig.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                  aria-label="Besök TechPartner AB på LinkedIn"
                >
                  <Linkedin className="mt-0.5 h-4 w-4 text-primary" />
                  <span>
                    LinkedIn är vår kanal för insikter, uppdateringar och
                    längre perspektiv på teknik och leverans.
                  </span>
                </a>
                <a
                  href={siteConfig.githubUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                  aria-label="Besök TechPartner AB på GitHub"
                >
                  <Github className="mt-0.5 h-4 w-4 text-primary" />
                  <span>
                    GitHub visar hur vi tänker kring struktur, verktyg och ett
                    modernt arbetssätt i tekniska leveranser.
                  </span>
                </a>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border/80 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">När passar ett första samtal?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Ett första samtal är särskilt värdefullt när ni står inför en
                  ny satsning, behöver modernisera ett äldre system eller vill
                  få bättre kontroll på molnkostnader och säkerhet.
                </p>
                <p>
                  Samtalet brukar också vara ett bra sätt att avgöra om ni
                  behöver en kort insats, ett paketupplägg eller ett mer
                  långsiktigt samarbete.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-muted/60 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            label="Nästa steg"
            title="Så ser första steget ut"
            description="Vi försöker göra uppstarten enkel och tydlig från början. Därför följer vi ett kort upplägg som snabbt skapar rätt förväntningar och en gemensam bild av vad som behöver göras."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {[
              {
                title: "1. Första kontakt",
                text: "Ni beskriver mål, nuläge och eventuella risker. Vi återkommer med frågor och ett förslag på hur ett första möte bör fokuseras.",
              },
              {
                title: "2. Gemensam genomgång",
                text: "Vi går igenom nuläge, prioriteringar och vad som behöver lösas först. Målet är att skapa en tydlig målbild utan att göra processen tung.",
              },
              {
                title: "3. Förslag på upplägg",
                text: "Efter mötet får ni ett konkret nästa steg, rekommenderat paket och en rimlig tidsbild. Då blir det lättare att fatta beslut och planera internt.",
              },
            ].map((step) => (
              <Card
                key={step.title}
                className="rounded-3xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="space-y-3 p-6">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {step.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.text}
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