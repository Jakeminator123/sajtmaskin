
import Link from "next/link";
import type { Metadata } from "next";


import {
  ArrowRight,
  Building2,
  Clock3,
  Github,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  TrainFront,
} from "lucide-react";




import { ContactForm } from "@/components/contact-form";
import { contactProcess, sharedKeywords, siteConfig, team } from "@/lib/site-data";
import Image from "next/image";

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const ogImage =
  "/placeholder.svg?height=630&width=1200&text=TechPartner+AB+kontakt";

const socialIcons = {
  linkedin: Linkedin,
  github: Github,
};

export const metadata: Metadata = {
  title: "Kontakt — boka ett första möte med TechPartner AB",
  description:
    "Kontakta TechPartner AB för ett första möte om systemutveckling, molnlösningar eller IT-säkerhet. Vi återkommer snabbt med nästa steg.",
  keywords: [...sharedKeywords, "kontakt TechPartner AB", "boka teknikmöte"],
  alternates: {
    canonical: "/kontakt",
  },
  openGraph: {
    title: "Kontakt — boka ett första möte med TechPartner AB",
    description:
      "Kontakta TechPartner AB för ett första möte om systemutveckling, molnlösningar eller IT-säkerhet. Vi återkommer snabbt med nästa steg.",
    url: `${siteConfig.url}/kontakt`,
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "Kontakt med TechPartner AB",
      },
    ],
    locale: "sv_SE",
    type: "website",
  },
};

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/60 bg-gradient-to-b from-background to-muted/60">
        <div className="section-shell grid gap-12 py-18 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge className="rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-none">
              Kontakt
            </Badge>
            <h1 className="font-display max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Kontakta oss för ett första möte om teknik, tempo och nästa steg.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Oavsett om du står inför ett nytt projekt, behöver stöd i molnet eller vill få bättre grepp om säkerhetsläget tar vi gärna en första avstämning.
              Vi återkommer snabbt med ett tydligt nästa steg så att dialogen blir enkel att komma vidare med.
            </p>
          </div>

          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="/placeholder.svg?height=760&width=920&text=Aff%C3%A4rsm%C3%B6te+i+ljus+skandinavisk+kontorsmilj%C3%B6"
              alt="Affärsmöte i ljus skandinavisk kontorsmiljö"
              width={920}
              height={760}
              priority
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-6 sm:p-8">
            <div className="space-y-4">
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Skicka din förfrågan
              </h2>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                Beskriv gärna nuläge, mål eller vilket område du vill ha stöd inom. Ju mer sammanhang du kan ge från start, desto snabbare kan vi föreslå ett relevant upplägg.
              </p>
            </div>
            <div className="mt-8">
              <ContactForm />
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-6">
              <div className="flex items-start gap-4">
                <div className="icon-chip">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Ring oss
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    För snabbast kontakt går det bra att ringa direkt under kontorstid. Vi bokar gärna ett kort första samtal för att förstå behovet bättre.
                  </p>
                  <a
                    href={siteConfig.phoneHref}
                    className="mt-3 inline-block text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteConfig.phone}
                  </a>
                </div>
              </div>
            </Card>

            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-6">
              <div className="flex items-start gap-4">
                <div className="icon-chip">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Mejla oss
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Om du vill samla mer information innan ett möte fungerar e-post utmärkt. Vi svarar normalt inom en arbetsdag med förslag på nästa steg.
                  </p>
                  <a
                    href={siteConfig.emailHref}
                    className="mt-3 inline-block text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteConfig.email}
                  </a>
                </div>
              </div>
            </Card>

            <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-6">
              <div className="flex items-start gap-4">
                <div className="icon-chip">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Kontorstider
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Vi är tillgängliga vardagar och kan även boka morgonmöten eller sena digitala avstämningar när det behövs.
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {siteConfig.officeHours}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="section-shell grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-5">
            <span className="section-label">Besöksadress</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Välkommen förbi eller boka ett möte hos er i Stockholm
            </h2>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Vi tar gärna möten på vårt kontor i Göteborg och arbetar löpande med företag i Stockholm genom hybridupplägg och besök på plats.
              För workshops, uppstarter och viktiga avstämningar anpassar vi formatet efter vad som fungerar bäst för ert team.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-5">
                <div className="flex items-start gap-4">
                  <div className="icon-chip">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      Adress
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {siteConfig.address}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="rounded-[1.75rem] border-border/70 bg-card/95 p-5">
                <div className="flex items-start gap-4">
                  <div className="icon-chip">
                    <TrainFront className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">
                      Så tar du dig hit
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Kontoret ligger centralt med gångavstånd från kollektivtrafik och närhet till möteslokaler för större workshops.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div className="panel-surface overflow-hidden p-3">
            <Image
              src="/placeholder.svg?height=620&width=860&text=Modern+kontorsfasad+och+karta+i+svensk+stadsmilj%C3%B6"
              alt="Modern kontorsfasad och karta i svensk stadsmiljö"
              width={860}
              height={620}
              className="h-full w-full rounded-[1.35rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="bg-background py-16 sm:py-24 lg:py-28">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <span className="section-label">Nästa steg och sociala länkar</span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              En enkel väg från första kontakt till tydligt förslag
            </h2>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Vi håller processen kort, tydlig och praktiskt användbar. Målet är att du snabbt ska få ett beslutsunderlag som går att använda direkt i verksamheten.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {siteConfig.socialLinks.map((link) => {
                const Icon = socialIcons[link.icon];

                return (
                  <Card
                    key={link.label}
                    className="rounded-[1.75rem] border-border/70 bg-card/95 p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-display text-lg font-semibold text-foreground">
                          {link.label}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Följ oss för uppdateringar, perspektiv kring teknikval och insikter från vardagen i våra uppdrag.
                        </p>
                      </div>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={link.label}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-secondary text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon className="h-5 w-5" />
                      </a>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Button asChild size="lg" className="rounded-full">
              <Link href="/priser">
                Se priser och paket
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4">
            {contactProcess.map((step) => (
              <Card
                key={step.title}
                className="rounded-[1.75rem] border-border/70 bg-card/95 p-6"
              >
                <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}