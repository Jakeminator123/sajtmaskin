
import Link from "next/link";
import type { Metadata } from "next";


import { ArrowRight, Check, Leaf, MessageCircleMore, Sparkles } from "lucide-react"




import { createMetadata, teamMembers } from "@/lib/site";
import Image from "next/image";
import { Button } from "@/components/ui/button"
import PageHero from "@/components/page-hero"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Om oss",
  description:
    "Lär känna Klipp & Stil i Göteborg. Vi arbetar med personligt bemötande, tydlig rådgivning och behandlingar som håller både i känsla och form.",
  path: "/om-oss",
});

const values = [
  {
    title: "Konsultation först",
    description:
      "Vi går igenom mål, hårkvalitet, underhåll och tidsplan innan vi börjar. Det gör att både du och vi kan känna oss trygga med upplägget.",
    icon: MessageCircleMore,
  },
  {
    title: "Tydliga rekommendationer",
    description:
      "Du får konkreta råd om produkter, rutiner och intervaller som fungerar i vardagen. Vi förenklar i stället för att komplicera.",
    icon: Check,
  },
  {
    title: "Noggrann finish",
    description:
      "Vi avslutar alltid med stylingtips så att du vet hur du återskapar looken hemma. Det är detaljerna som gör att resultatet håller längre.",
    icon: Sparkles,
  },
  {
    title: "Hållbara val där det passar",
    description:
      "Vi tänker långsiktigt kring färg, kvalitet och underhåll. Målet är ett snyggt resultat som känns rätt även när håret växer ut.",
    icon: Leaf,
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Om Klipp & Stil"
        title="En salong där personligt bemötande och trygg rådgivning går hand i hand"
        description="Klipp & Stil är en frisörsalong i Göteborg där du får ett personligt bemötande och ett resultat som passar din vardag. Vi jobbar lugnt, noggrant och med tydlig kommunikation – från konsultation till sista finish."
        imageSrc="https://images.unsplash.com/photo-1645220127374-8f7a0269025a?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Teamet i salongen i varmt naturligt ljus"
        primaryAction={{ label: "Boka tid", href: "/boka" }}
        secondaryAction={{ label: "Kontakta oss", href: "/kontakt" }}
        details={[
          { label: "Fokus", value: "Kvalitet, lyhördhet och resultat som håller" },
          { label: "Arbetssätt", value: "Lugnt tempo och tydlig kommunikation" },
          { label: "Miljö", value: "Varm salongskänsla mitt i Göteborg" },
        ]}
        note="Vi vill att varje besök ska kännas tydligt, tryggt och personligt – utan stress, utan gissningar och utan onödigt krångel."
      />

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Vår historia"
              title="Skickligt hantverk och en varm upplevelse från första dagen"
              description="Salongen startade med en enkel idé: att kombinera skickligt hantverk med en varm upplevelse där kunden får tid och trygg rådgivning. Idag hjälper vi både nya och återkommande kunder att hitta en stil som känns rätt – och som är lätt att hålla efter."
            />
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Vi tror inte på snabba standardlösningar. I stället lägger vi tid på att lyssna, förstå hårkvalitet och prata igenom hur resultatet ska fungera i din vardag, oavsett om du vill ha en liten uppfräschning eller ett större helhetslyft.
            </p>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Det betyder också att vi är ärliga i våra rekommendationer. Om något behöver mer tid, en annan behandling eller ett stegvis upplägg säger vi det tydligt redan från början, så att du känner dig trygg med både pris och förväntningar.
            </p>
          </div>

          <div className="paper-panel-strong overflow-hidden p-3">
            <div className="relative aspect-[5/6] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[4/5]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=960&fit=crop&q=80"
                alt="Detaljbild från salongen med sax, spegel och varm känsla"
                fill
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <SectionHeading
            eyebrow="Teamet"
            title="Tre olika styrkor, samma lugna känsla i stolen"
            description="Vi arbetar nära varandra och delar samma syn på upplevelsen: varje kund ska känna sig sedd, förstådd och trygg genom hela besöket. Det gör att både kommunikationen och resultaten blir bättre."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <article key={member.name} className="paper-panel overflow-hidden p-3">
                <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted">
                  <Image
                    src={member.image}
                    alt={member.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <h3 className="text-2xl font-semibold tracking-tight">{member.name}</h3>
                  <p className="mt-1 text-sm uppercase tracking-[0.16em] text-accent">{member.role}</p>
                  <p className="mt-4 text-base leading-7 text-muted-foreground">{member.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <SectionHeading
          eyebrow="Så arbetar vi"
          title="Tydliga steg som gör besöket enkelt från början till slut"
          description="När du vet vad som händer, hur lång tid det tar och vad som passar ditt hår blir upplevelsen både lugnare och bättre. Därför har vi byggt vårt arbetssätt kring tydlighet och lyhördhet."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {values.map((value) => (
            <article key={value.title} className="paper-panel p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
                <value.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">{value.title}</h3>
              <p className="mt-3 text-base leading-7 text-muted-foreground">{value.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell py-8 sm:py-12">
        <div className="rounded-[2rem] border bg-card/85 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.22em] text-accent">Nästa steg</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Vill du att vi hjälper dig hitta rätt behandling?
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Boka en tid eller hör av dig så guidar vi dig till rätt tjänst och tidslängd. Vi hjälper dig gärna att tänka igenom både mål, underhåll och vad som blir mest hållbart för ditt hår.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg" className="rounded-full">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <Link href="/kontakt">Kontakta oss</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}