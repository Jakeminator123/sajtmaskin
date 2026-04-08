import {
  ArrowUpRight,
  Building2,
  Clock3,
  Github,
  Linkedin,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";





import { ContactForm } from "@/components/contact-form";

import { createPlaceholderSrc, siteConfig } from "@/lib/site-data";
import Image from "next/image";
import { createMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export const metadata = createMetadata({
  title:
    "Kontakt — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Kontakta TechPartner AB för rådgivning inom systemutveckling, moln och IT-säkerhet. Boka ett möte eller skicka en förfrågan idag.",
  keywords: [
    "kontakt TechPartner AB",
    "boka teknikkonsult",
    "systemutveckling kontakt",
    "molnlösningar kontakt",
    "IT-säkerhet rådgivning",
  ],
});

const contactCards = [
  {
    icon: Phone,
    title: "Telefon",
    value: siteConfig.phone,
    href: siteConfig.phoneHref,
    description:
      "Passar när ni snabbt vill bolla ett behov, ett pågående projekt eller en konkret fråga kring er teknikmiljö.",
  },
  {
    icon: Mail,
    title: "E-post",
    value: siteConfig.email,
    href: siteConfig.emailHref,
    description:
      "Skicka gärna med lite bakgrund om ert nuläge så kan vi förbereda ett mer relevant första samtal.",
  },
  {
    icon: MapPin,
    title: "Adress",
    value: siteConfig.address,
    href: "https://maps.google.com/?q=Storgatan+12,+411+38+Goteborg",
    description:
      "Vi arbetar främst med kunder i Stockholm men håller även möten från vårt kontor i Göteborg och digitalt.",
  },
  {
    icon: Clock3,
    title: "Öppettider",
    value: siteConfig.hours,
    href: siteConfig.emailHref,
    description:
      "Vi återkommer normalt inom en arbetsdag. För planerade workshops bokar vi tid efter era önskemål.",
  },
];

const processSteps = [
  {
    title: "Första genomgång",
    description:
      "Vi börjar med att förstå nuläge, mål och vilka delar av er teknik eller organisation som kräver mest fokus. Det gör det lättare att ge relevanta råd direkt.",
  },
  {
    title: "Rekommenderat upplägg",
    description:
      "Efter mötet föreslår vi ett nästa steg som passar ert behov och er budget. Det kan vara ett paket, en förstudie eller ett mer avgränsat uppdrag.",
  },
  {
    title: "Tydlig start",
    description:
      "När vi går vidare sätter vi ramar, ansvar och förväntningar från början. Det skapar trygghet för både ledning, projektteam och tekniska specialister.",
  },
];

const socialItems = [
  {
    title: "LinkedIn",
    href: "https://www.linkedin.com/company/techpartner-ab",
    icon: Linkedin,
    description:
      "Här delar vi perspektiv på teknikledning, digitalisering och hur företag kan bygga starkare plattformar.",
  },
  {
    title: "GitHub",
    href: "https://github.com/techpartner-ab",
    icon: Github,
    description:
      "Vi tror på struktur, tydlighet och tekniskt hantverk. GitHub är en naturlig plats för att visa hur vi tänker kring kvalitet.",
  },
  {
    title: "E-post",
    href: siteConfig.emailHref,
    icon: Mail,
    description:
      "Om ni vill ta en direkt dialog med vårt team är mejl ofta den snabbaste vägen till ett första konkret förslag.",
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
              Låt oss prata om hur er teknik kan bli enklare att styra
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Om ni planerar ett nytt initiativ, behöver stärka er molnplattform
              eller vill få bättre kontroll över säkerhetsarbetet är vi gärna med
              tidigt i dialogen. Vi håller samtalet konkret och anpassat efter
              var ni befinner er just nu.
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
                alt="Affärsmöte i ett modernt kontor med skandinavisk känsla"
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
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
          <ContactForm />

          <div className="space-y-4">
            {contactCards.map((item) => (
              <Card key={item.title} className="border-border bg-card shadow-sm">
                <CardContent className="flex gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h2>
                    <a
                      href={item.href}
                      target={item.href.startsWith("http") ? "_blank" : undefined}
                      rel={
                        item.href.startsWith("http") ? "noreferrer" : undefined
                      }
                      className="text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.value}
                    </a>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="border-border bg-muted/70 shadow-sm">
              <CardHeader>
                <h2 className="text-lg font-semibold tracking-tight">
                  Vad händer efter att ni hört av er?
                </h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Vi läser igenom er förfrågan, återkommer med relevanta frågor
                  och föreslår ett första möte om det känns rätt. Målet är att ni
                  snabbt ska få en tydlig bild av nästa steg och ett rimligt
                  upplägg för fortsatt dialog.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  1200,
                  900,
                  "Modern Scandinavian office building and city street",
                )}
                alt="Modernt kontorshus vid stadsgata"
                fill
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <Badge variant="outline">Besöksadress</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Välkommen att träffa oss i en miljö där det är lätt att arbeta fokuserat
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Vårt kontor ligger på {siteConfig.address}. För många kunder
                fungerar det lika bra att mötas digitalt eller på plats i
                Stockholm, men när ni vill samla rätt personer runt samma bord
                hjälper vi gärna till att skapa ett lugnt och effektivt möte.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">På plats eller hybrid</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Vi planerar gärna workshops och genomgångar utifrån vad som
                    fungerar bäst för ert team och era beslutsvägar.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Enkel kontaktväg</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Om ni vill boka möte direkt går det bra att ringa eller mejla
                    oss så hittar vi en tid som passar.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Så arbetar vi när ni hör av er</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              En tydlig process från första kontakt
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi vill göra det enkelt att komma igång. Därför håller vi processen
              tydlig, transparent och anpassad efter hur mycket stöd ni behöver
              redan i det första skedet.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {processSteps.map((step) => (
              <Card
                key={step.title}
                className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardHeader>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {step.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="max-w-3xl space-y-4">
              <Badge variant="outline">Sociala medier</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Följ oss där dialogen fortsätter
              </h2>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                I våra kanaler delar vi erfarenheter från utvecklingsarbete,
                molnresor och säkerhetsfrågor som är relevanta för teknikledare.
                Där får ni en känsla för hur vi tänker, prioriterar och arbetar.
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {socialItems.map((item) => (
                <a
                  key={item.title}
                  href={item.href}
                  target={item.href.startsWith("http") ? "_blank" : undefined}
                  rel={item.href.startsWith("http") ? "noreferrer" : undefined}
                  className="rounded-[1.5rem] border border-border bg-muted/50 p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}