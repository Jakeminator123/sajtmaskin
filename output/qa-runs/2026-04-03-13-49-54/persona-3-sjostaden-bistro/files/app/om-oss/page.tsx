
import Link from "next/link";
import type { Metadata } from "next";


import { CalendarDays, Circle as ChefHat, Leaf, MapPinned } from "lucide-react"



import { createMetadata, teamMembers, workValues } from "@/lib/site-data";
import Image from "next/image";
import { Button } from "@/components/ui/button"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Om oss",
  description:
    "Lär känna Sjöstaden Bistro, vårt team och hur vi arbetar med lokala råvaror, säsongsmeny och ett varmt men genomtänkt värdskap.",
  path: "/om-oss",
});

const valueIcons = [MapPinned, CalendarDays, ChefHat, Leaf];

export default function AboutPage() {
  return (
    <div className="overflow-x-hidden">
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-primary/80">Om Sjöstaden Bistro</p>
            <h1 className="max-w-3xl text-5xl tracking-tight sm:text-6xl">
              En bistro som låter råvaran tala med lugn och precision
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi är en bistro som älskar råvaror med tydligt ursprung och smaker som får ta plats.
              Vår meny följer säsongen och vi jobbar nära lokala producenter. Hos oss ska det
              kännas både genomtänkt och avslappnat.
            </p>
            <Button asChild size="lg" className="rounded-full px-7 active:scale-95">
              <Link href="/meny">Se menyn</Link>
            </Button>
          </div>

          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=900&fit=crop&q=80"
                alt="Barhörna i mörk bistrointeriör med varma metalltoner och dämpad belysning"
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Vår historia"
              title="Från enkel idé till självklar mötesplats"
              description="Sjöstaden Bistro startade med en enkel idé: servera modern skandinavisk mat utan krusiduller, men med kompromisslöst hantverk. Vi inspireras av kusten, skogen och marknaden – och låter säsongen styra både smaker och stämning."
            />
            <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Oavsett om du kommer för en snabb lunch eller en lång middag vill vi att du ska känna
              dig omhändertagen från första minuten. Därför arbetar kök och matsal tätt ihop, så att
              upplevelsen blir sammanhängande från bokning till sista kaffet.
            </p>
          </div>

          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=700&fit=crop&q=80"
                alt="Råvaror med fisk, rotfrukter, örter, svamp och bär på mörk bakgrund"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/35 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Teamet"
            title="Människorna bakom känslan i matsalen"
            description="Vårt team kombinerar köksmässig disciplin med ett varmt, personligt värdskap. Det gör att måltiden känns lika genomarbetad i mötet som på tallriken."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <article key={member.name} className="surface-panel overflow-hidden">
                <div className="relative h-72">
                  <Image src={member.image} alt={member.alt} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/75 to-transparent" />
                </div>
                <div className="space-y-3 p-6">
                  <p className="text-sm uppercase tracking-[0.24em] text-primary/80">{member.role}</p>
                  <h2 className="text-2xl tracking-tight">{member.name}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{member.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Så arbetar vi"
            title="Fyra principer som håller ihop allt från råvara till service"
            description="Vi bygger upplevelsen genom konsekventa val i kök, inköp och värdskap. Det gör att maten känns tydlig, rummet lugnt och varje besök pålitligt."
          />

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {workValues.map((value, index) => {
              const Icon = valueIcons[index];

              return (
                <article
                  key={value.title}
                  className="surface-panel brass-line p-6 pt-8 transition-all duration-300 motion-safe:hover:-translate-y-1"
                >
                  <Icon className="mb-4 h-5 w-5 text-primary" />
                  <h2 className="text-2xl tracking-tight">{value.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {value.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="surface-panel overflow-hidden p-8 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.3em] text-primary/80">
                  Nyfiken på en kväll hos oss?
                </p>
                <h2 className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
                  Boka bord online eller kontakta oss för catering och större sällskap.
                </h2>
                <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Vi hjälper dig gärna att hitta rätt menyupplägg, dryckesnivå och tempo för
                  sällskapet – oavsett om det gäller middag för två eller ett helt event.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button asChild size="lg" className="rounded-full active:scale-95">
                  <Link href="/boka">Boka tid</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary/20 bg-background/60 active:scale-95"
                >
                  <Link href="/kontakt">Kontakta oss</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}