import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { ContactFormBasic } from "@/components/contact-form-basic";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createMetadata } from "@/lib/metadata";
import { createPlaceholderSrc, siteConfig } from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "Kontakt — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Kontakta TechPartner AB för rådgivning inom systemutveckling, moln och IT-säkerhet. Berätta om ert behov så återkommer vi snabbt.",
  keywords: [
    "kontakt techpartner",
    "systemutveckling rådgivning",
    "molnlösningar kontakt",
    "it-säkerhet rådgivning",
    "techpartner ab kontakt",
  ],
});

const channels = [
  {
    icon: Phone,
    title: "Telefon",
    value: siteConfig.phone,
    href: siteConfig.phoneHref,
    text: "Ring oss om ni vill diskutera ett pågående initiativ eller en konkret teknisk utmaning.",
  },
  {
    icon: Mail,
    title: "E-post",
    value: siteConfig.email,
    href: siteConfig.emailHref,
    text: "Skicka en kort sammanfattning av era mål så föreslår vi lämpliga nästa steg.",
  },
  {
    icon: MapPin,
    title: "Adress",
    value: siteConfig.address,
    href: "https://maps.google.com/?q=Storgatan+12,+411+38+Goteborg",
    text: "Vi arbetar främst med företag i Stockholm och håller även workshops på plats hos kund.",
  },
];

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center space-y-6">
            <Badge variant="secondary" className="w-fit">
              Kontakt
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Starta en tydlig dialog med vårt team
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Oavsett om ni planerar en ny plattform, förbättrar er molndrift eller
              stärker säkerheten kan vi hjälpa er framåt med struktur och tydlighet.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  1200,
                  900,
                  "Scandinavian business consultation in modern office",
                )}
                alt="Affärsmöte i ett modernt skandinaviskt kontor"
                fill
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <ContactFormBasic />

          <div className="space-y-4">
            {channels.map((item) => (
              <Card key={item.title} className="border-border bg-card shadow-sm">
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                    <a
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.value}
                    </a>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill ni jämföra paket innan ni bokar ett möte?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  Se våra paketalternativ för att få en tydlig bild av omfattning,
                  arbetstakt och vad som ingår. Därefter kan vi anpassa upplägget
                  efter era prioriteringar.
                </p>
              </div>

              <Link
                href="/priser"
                className="inline-flex items-center rounded-lg border border-border bg-background px-5 py-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Se priser
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}