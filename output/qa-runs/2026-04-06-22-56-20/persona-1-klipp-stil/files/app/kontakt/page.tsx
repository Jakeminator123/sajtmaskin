
import Image from "next/image";
import type { Metadata } from "next";


import {
  Clock,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";



import { ContactForm } from "@/components/contact-form";

import { import, from "next/image";
import { } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"
import { openingHours, siteInfo, socialLinks } from "@/lib/site-data";
  openingHours, openingHours, siteInfo, socialLinks } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Klipp & Stil — Kontakt, adress och direktvägar till salongen",
  description:
    "Kontakta Klipp & Stil i Göteborg för bokning, frågor eller rådgivning. Här hittar du formulär, telefon, e-post, adress och öppettider.",
  keywords: [
    "kontakt frisör Göteborg",
    "adress frisör Göteborg",
    "telefon frisör Göteborg",
    "Klipp & Stil kontakt",
    "öppettider frisör Göteborg",
  ],
  openGraph: {
    title: "Klipp & Stil — Kontakt, adress och direktvägar till salongen",
    description:
      "Kontakta Klipp & Stil i Göteborg för bokning, frågor eller rådgivning. Här hittar du formulär, telefon, e-post, adress och öppettider.",
    locale: "sv_SE",
    type: "website",
  },
};

const socialIconMap = {
  Instagram,
  Facebook,
};

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
          <Badge
            variant="secondary"
            className="rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
          >
            Kontakt
          </Badge>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Hör av dig för bokning, frågor eller rådgivning
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Oavsett om du vill boka en tid, fråga om en behandling eller få råd
            inför en färgning hjälper vi dig gärna. Hör av dig via formuläret,
            telefon eller e-post så återkommer vi så snart vi kan.
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Kontaktvägar"
            title="Skriv till oss eller ta direktkontakt"
            description="Formuläret passar bra när du vill beskriva ett önskemål lite mer utförligt. Vill du hellre prata direkt når du oss också via telefon och e-post under salongens öppettider."
          />

          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="rounded-[2rem] border-border bg-card shadow-lg">
              <CardContent className="p-6 sm:p-8">
                <ContactForm />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Ring oss
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Om du vill boka snabbt eller stämma av en fråga kring din
                    behandling kan du alltid ringa under öppettid.
                  </p>
                  <a
                    href={`tel:${siteInfo.phone.replace(/\s/g, "")}`}
                    className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteInfo.phone}
                  </a>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Mejla oss
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Beskriv gärna din idé, om du vill ha rådgivning eller om du
                    har önskemål inför ett särskilt tillfälle.
                  </p>
                  <a
                    href={`mailto:${siteInfo.email}`}
                    className="text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {siteInfo.email}
                  </a>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Besöksadress
                    </h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {siteInfo.address}. Vi ligger centralt med nära avstånd till
                    både spårvagn, buss och cityparkeringar.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
            <Image
              src="/placeholder.svg?height=850&width=950&text=Fasad+och+entré+till+frisörsalong+på+Storgatan+i+Göteborg"
              alt="Fasad och entré till frisörsalong på Storgatan i Göteborg"
              width={950}
              height={850}
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>

          <div className="space-y-6">
            <SectionHeading
              eyebrow="Hitta hit"
              title="Mitt i Göteborg med nära till allt"
              description="Salongen ligger på Storgatan 12 med kort promenadavstånd från flera spårvagnshållplatser. Om du kommer med bil finns parkeringshus i närheten, och om du kommer från jobbet är det enkelt att svänga förbi på vägen hem."
            />

            <Card className="rounded-[2rem] border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Öppettider
                  </h2>
                </div>
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
                <h3 className="text-xl font-semibold">Praktisk information</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Behöver du boka om din tid ber vi dig att höra av dig senast 24
                  timmar innan. Om du är osäker på behandling inför ditt besök kan
                  du skriva det i formuläret så hjälper vi dig vidare.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Sociala medier"
            title="Följ salongen och se mer av vardagen hos oss"
            description="På våra sociala kanaler delar vi nya resultat, färginspiration och glimtar från livet i salongen. Där får du en känsla för både vårt arbetssätt och den stämning vi vill skapa för varje kund."
            align="center"
          />

          <div className="grid gap-6 md:grid-cols-2">
            {socialLinks.map((social) => {
              const Icon = socialIconMap[social.label as keyof typeof socialIconMap];

              return (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[2rem] border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {social.label}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Följ oss för inspiration och nya resultat.
                      </p>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}