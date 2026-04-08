import React from "react";
import Link from "next/link";
import type { Metadata } from "next";




import { ArrowRight, Clock3, Leaf, MessageSquare, Sparkles } from "lucide-react"





import { createPageMetadata } from "@/lib/site";
import type { ComponentType } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createPageMetadata({
  title: "Om oss",
  path: "/om-oss",
  description:
    "Läs om Klipp & Stil i Göteborg, vårt team och vårt arbetssätt. Vi kombinerar konsultation, hantverk och varm service för hår som känns rätt länge.",
});

type TeamMember = {
  name: string;
  role: string;
  bio: string;
  image: string;
  alt: string;
};

type Principle = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const team: TeamMember[] = [
  {
    name: "Anna Karlsson",
    role: "Creative Director & Frisör",
    bio: "Specialiserad på klippteknik och naturliga färger. Anna arbetar lyhört och noggrant med fokus på form, balans och resultat som håller sig snygga över tid.",
    image:
      "https://images.unsplash.com/photo-1567336273898-ebbf9eb3c3bf?w=480&h=600&fit=crop&q=80",
    alt: "Porträtt av Anna Karlsson i salongen",
  },
  {
    name: "Maja Nilsson",
    role: "Frisör & Colorist",
    bio: "Maja älskar slingor, nyanser och glansiga resultat. Hon hjälper dig hitta rätt ton utifrån hudton, hårkvalitet och hur du vill att håret ska kännas i vardagen.",
    image:
      "https://images.unsplash.com/photo-1686405585580-2a1f5aac9837?w=480&h=600&fit=crop&q=80",
    alt: "Porträtt av Maja Nilsson i salongen",
  },
  {
    name: "Erik Johansson",
    role: "Barber & Frisör",
    bio: "Erik arbetar med skäggvård, herrklipp och skarpa konturer. Han ger tydliga råd om enkel styling hemma så att looken fortsätter kännas genomtänkt även mellan besöken.",
    image:
      "https://images.unsplash.com/photo-1510852328951-457a8f54a7f6?w=480&h=600&fit=crop&q=80",
    alt: "Porträtt av Erik Johansson i salongen",
  },
];

const principles: Principle[] = [
  {
    title: "Konsultation först",
    description:
      "Vi pratar igenom mål, referensbilder, underhåll och vad som känns realistiskt för dig innan vi sätter igång. Det gör att både prisbild och förväntningar blir tydliga från början.",
    icon: MessageSquare,
  },
  {
    title: "Hårhälsa i fokus",
    description:
      "Vi rekommenderar behandlingar och produkter utifrån ditt hår, inte bara utifrån trender. På så sätt får du ett resultat som både ser fint ut och känns bra på längre sikt.",
    icon: Leaf,
  },
  {
    title: "Tydlighet hela vägen",
    description:
      "Du får en tydlig bild av tidsåtgång och upplägg innan behandlingen börjar. Om något behöver justeras under tiden berättar vi det direkt så att du känner dig trygg.",
    icon: Clock3,
  },
  {
    title: "Finish & råd hemma",
    description:
      "Vi avslutar inte bara med styling, utan visar även vad som gör skillnad hemma. Små justeringar i teknik och produkter kan ge ett betydligt mer hållbart resultat mellan besöken.",
    icon: Sparkles,
  },
];

export default function AboutPage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Om Klipp & Stil
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                En frisörsalong där du ska känna dig trygg från första stund
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Vi är en frisörsalong i Göteborg som kombinerar hantverk, trendkänsla och ett varmt bemötande. Hos oss ska du känna dig trygg från konsultation till sista finish, oavsett om du kommer för en uppfräschning eller en större förändring.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>

          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1542868530-528894d9869f?w=1100&h=900&fit=crop&q=80"
                alt="Lugn och inbjudande salongsinteriör med naturligt ljus"
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
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Vår historia"
              title="En salong byggd kring relationer, kvalitet och ett enklare frisörbesök"
              description="Klipp & Stil startade med en enkel idé: att göra frisörbesöket personligt och okomplicerat. Vi tar oss tid att förstå din vardag och ditt hår, så att resultatet blir både snyggt och lätt att sköta när du går hem."
            />
            <p className="max-w-3xl text-base leading-8 text-muted-foreground">
              För oss handlar ett bra besök inte bara om vad som händer i stolen, utan om helheten runt omkring. Därför arbetar vi med tydlig rådgivning, lugnt tempo och ett bemötande som gör att du känner dig sedd, inte stressad.
            </p>
          </div>

          <div className="section-shell bg-card/90 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="muted-shell p-5">
                <h3 className="text-lg font-semibold">Kvalitet före tempo</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Vi planerar våra tider så att det finns utrymme för rådgivning, precision och finish utan att känslan blir forcerad.
                </p>
              </div>
              <div className="muted-shell p-5">
                <h3 className="text-lg font-semibold">Långsiktiga resultat</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  Målet är att du ska trivas med håret även veckorna efter ditt besök, inte bara när du lämnar salongen samma dag.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Teamet"
            title="Tre frisörer med olika styrkor, men samma känsla för service"
            description="Hos oss möter du ett team som kompletterar varandra väl. Det gör att vi kan hjälpa dig vidare oavsett om du vill ha en klippning som sitter perfekt, en ny färg som känns rätt eller skäggvård med skarpa detaljer."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {team.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden rounded-[1.9rem] border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:border-accent/30 hover:shadow-lg"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Image
                    src={member.image}
                    alt={member.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 33vw"
                  />
                </div>
                <CardContent className="space-y-3 p-6">
                  <div>
                    <h3 className="text-xl font-semibold">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Så jobbar vi"
            title="Tydligt upplägg från första fråga till sista finish"
            description="Vi vill att du ska känna att du vet vad som händer, varför vi rekommenderar något och hur resultatet kan hålla sig fint över tid. Därför arbetar vi med ett lugnt, tydligt och personligt flöde genom hela besöket."
          />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {principles.map((principle) => {
              const Icon = principle.icon;

              return (
                <Card key={principle.title} className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/25 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-xl font-semibold">{principle.title}</h3>
                      <p className="text-sm leading-7 text-muted-foreground">{principle.description}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-accent px-6 py-10 text-accent-foreground sm:px-10 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-background/15 px-4 py-1 text-accent-foreground hover:bg-background/15">
                  Vill du boka en konsultation?
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Osäker på vad du vill göra? Vi hjälper dig att välja rätt upplägg.
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-accent-foreground/85">
                  Boka en tid så går vi igenom vad som passar din hårkvalitet, din stil och hur mycket underhåll du vill ha. Det gör det enklare att hitta en behandling som känns rätt både nu och efteråt.
                </p>
              </div>

              <div className="section-shell bg-background/92 p-6 text-foreground">
                <h3 className="text-2xl font-semibold">Tydligt, tryggt och personligt</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Du behöver inte veta exakt vad du ska boka för att höra av dig. Beskriv gärna kort vad du funderar på så guidar vi dig vidare.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="rounded-full transition-all duration-200 active:scale-95">
                    <Link href="/boka">Boka tid</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                    <Link href="/kontakt">Kontakta oss</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}