
import Link from "next/link";
import type { Metadata } from "next";


import {
  Clock3,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Youtube,
} from "lucide-react";

import { ContactForm } from "@/components/contact-form";
import Image from "next/image";
import { siteConfig } from "@/lib/site-data";

import { Card, CardContent } from "@/components/ui/card"



export const metadata: Metadata = {
  title: "Kontakt — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Kontakta Sjöstaden Bistro i Malmö för bokning, catering eller frågor. Här hittar du formulär, öppettider, adress, telefonnummer och våra sociala kanaler.",
  keywords: [
    "kontakt Sjöstaden Bistro",
    "catering Malmö kontakt",
    "restaurang Malmö öppettider",
    "adress restaurang Malmö",
    "telefon restaurang Malmö",
  ],
  openGraph: {
    title:
      "Kontakt — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Skicka ett meddelande till Sjöstaden Bistro, se öppettider och hitta adress, telefonnummer och sociala länkar för restaurangen i Malmö.",
  },
};

const socials = [
  {
    label: "Instagram",
    href: "https://instagram.com",
    icon: Instagram,
    description: "Följ kvällens serveringar, råvaror i säsong och glimtar från matsalen.",
  },
  {
    label: "Facebook",
    href: "https://facebook.com",
    icon: Facebook,
    description: "Ta del av nyheter, lunchinformation och kommande evenemang.",
  },
  {
    label: "YouTube",
    href: "https://youtube.com",
    icon: Youtube,
    description: "Se korta berättelser från köket, leverantörerna och våra menyer.",
  },
];

export default function KontaktPage() {
  return (
    <div className="flex flex-col">
      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.28em] text-primary">
              Kontakt
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Hör av dig om bokning, catering eller frågor inför ditt besök.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Oavsett om du vill boka bord, planera ett större sällskap eller
              fråga om catering svarar vi gärna. Här hittar du både kontaktformulär,
              direktkontakt och våra öppettider.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Vi försöker alltid återkomma snabbt under öppettid och hjälper gärna
              till om du behöver anpassningar, vill diskutera menyupplägg eller
              söker en restaurangmiljö för ett särskilt tillfälle.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=760&width=900&text=Restaurangentré+i+Malmö+vid+kvällstid+med+varma+ljus+och+elegant+skyltning"
              alt="Restaurangentré i Malmö vid kvällstid med varm och elegant känsla"
              width={900}
              height={760}
              priority
              className="h-[420px] w-full object-cover sm:h-[520px]"
            />
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <ContactForm />

          <div className="space-y-6">
            <Card className="border-border/80 bg-card">
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold">Direktkontakt</h2>
                <div className="mt-5 space-y-5 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Telefon</h3>
                      <a
                        href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                        className="transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {siteConfig.phone}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">E-post</h3>
                      <a
                        href={`mailto:${siteConfig.email}`}
                        className="transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {siteConfig.email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Adress</h3>
                      <p>{siteConfig.address}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="overflow-hidden rounded-[1.75rem] border border-border/70">
              <Image
                src="/placeholder.svg?height=500&width=700&text=Karta+över+vattennära+restaurangläge+i+centrala+Malmö+med+stilren+presentation"
                alt="Stilren vy över restaurangens centrala läge i Malmö"
                width={700}
                height={500}
                className="h-[260px] w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <Card className="border-border/80 bg-card">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold">Öppettider</h2>
              </div>
              <div className="mt-6 space-y-4 text-sm text-muted-foreground">
                {siteConfig.openingHours.map((item) => (
                  <div
                    key={item.day}
                    className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
                  >
                    <span>{item.day}</span>
                    <span className="text-foreground">{item.time}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-6 text-muted-foreground">
                För cateringförfrågningar och större sällskap svarar vi gärna även
                utanför ordinarie service om du skickar ett meddelande via formuläret.
              </p>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-3xl font-semibold sm:text-4xl">Sociala medier</h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Följ oss för att se kvällens rätter, lunchinformation och glimtar
              från köket. På våra sociala kanaler visar vi hur menyerna förändras
              med säsongen och när vi har särskilda event eller nya dryckeslistor.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {socials.map((social) => {
                const Icon = social.icon;

                return (
                  <Card
                    key={social.label}
                    className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                  >
                    <CardContent className="p-6">
                      <div className="mb-5 inline-flex rounded-full bg-primary/10 p-3 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-2xl font-semibold">{social.label}</h3>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {social.description}
                      </p>
                      <Link
                        href={social.href}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-5 inline-flex text-sm font-medium text-primary transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Besök kanal
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">
              Besök oss i Malmö eller skicka en cateringförfrågan
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Vår matsal ligger nära vattnet och passar både spontana luncher och
              planerade kvällar. Om du vill ta med samma känsla till ett annat
              sammanhang hjälper vi gärna till med catering som anpassas efter
              plats, antal gäster och tillfälle.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Skriv gärna om det gäller privat middag, företagsevent eller en
              kulturell tillställning. Då kan vi föreslå rätt upplägg redan från start.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=760&width=960&text=Kvällsbild+från+Malmö+hamnområde+med+elegant+bistro+och+varma+ljus"
              alt="Kvällsbild från Malmös hamnområde nära restaurangen"
              width={960}
              height={760}
              className="h-[360px] w-full object-cover sm:h-[460px]"
            />
          </div>
        </div>
      </section>
    </div>
  );
}