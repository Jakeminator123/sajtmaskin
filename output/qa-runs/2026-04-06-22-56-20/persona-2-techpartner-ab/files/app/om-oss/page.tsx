import { ArrowRight, BarChart3, Handshake, ShieldCheck, Users } from "lucide-react"
import Link from "next/link";








import { createMetadata, createPlaceholderSrc, import Image from "next/image";
import { createMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { milestones, siteConfig, teamMembers, values } from "@/lib/site-data";
  createPlaceholderSrc, milestones, siteConfig, teamMembers, values } from "@/lib/site-data";

export const metadata = createMetadata({
  title:
    "Om oss — TechPartner AB erbjuder systemutveckling, molnlösningar och IT-säkerhet för företag i Stockholm",
  description:
    "Lär känna TechPartner AB, vårt team och vårt arbetssätt. Vi kombinerar affärsförståelse, senior utveckling och säker leverans för företag.",
  keywords: [
    "om TechPartner AB",
    "teknikpartner Stockholm",
    "senior systemutveckling",
    "moln och säkerhet företag",
    "IT-konsult Stockholm",
  ],
});

const valueIcons = [Handshake, ShieldCheck, Users, BarChart3];

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background via-background to-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center space-y-6">
            <Badge variant="secondary" className="w-fit">
              Om TechPartner AB
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Vi bygger långsiktiga samarbeten där teknik blir lättare att styra
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              TechPartner AB finns för företag som vill få mer fart i teknikarbetet
              utan att tappa kontroll eller kvalitet. Vi arbetar nära ledning,
              IT-chefer och produktteam för att skapa lösningar som fungerar i
              praktiken och som går att förvalta över tid.
            </p>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vårt arbetssätt är skandinaviskt i sin enkelhet: tydliga beslut,
              raka rekommendationer och ansvar för helheten. Det gör att även
              komplexa projekt får en lugnare och mer hållbar riktning.
            </p>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-sm">
            <div className="relative aspect-[4/3]">
              <Image
                src={createPlaceholderSrc(
                  1200,
                  900,
                  "Scandinavian tech leadership team in meeting room",
                )}
                alt="Ledningsmöte med TechPartner AB i en ljus konferensmiljö"
                fill
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="space-y-4">
            <Badge variant="outline">Vår historia</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Från specialiststöd till strategisk leveranspartner
            </h2>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              TechPartner AB startade med en enkel idé: företag ska kunna få
              tillgång till senior teknisk kompetens utan att först bygga ett
              stort internt specialistlager. Behovet kom ofta från bolag som
              vuxit snabbt och behövde mer struktur, bättre plattformar och
              tryggare teknikbeslut.
            </p>
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              Med tiden har vårt uppdrag breddats. I dag hjälper vi kunder att
              kombinera systemutveckling, moln och säkerhet i en sammanhållen
              riktning där både ledning och teknikteam får bättre beslutsunderlag.
            </p>
          </div>

          <div className="grid gap-4">
            {milestones.map((milestone) => (
              <Card key={milestone.year} className="border-border bg-card shadow-sm">
                <CardContent className="space-y-3 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                    {milestone.year}
                  </p>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {milestone.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {milestone.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/50 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Teamet</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Ett litet seniorteam med tydliga roller
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi håller teamet fokuserat och kompetensen hög. Det betyder att ni
              möter personer som både kan diskutera strategi med ledningen och
              gå på djupet i tekniska vägval när det behövs.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <Card
                key={member.name}
                className="overflow-hidden border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={createPlaceholderSrc(600, 450, member.imageQuery)}
                    alt={`Porträtt av ${member.name}`}
                    fill
                    sizes="(min-width: 1024px) 30vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <CardHeader className="space-y-2">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {member.name}
                  </h3>
                  <p className="text-sm font-medium text-primary">{member.role}</p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {member.bio}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge variant="outline">Värderingar och arbetssätt</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Så arbetar vi tillsammans med våra kunder
            </h2>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Vi tror på ett samarbete där teknikfrågor blir begripliga och där
              besluten faktiskt går att förankra i verksamheten. Därför arbetar
              vi med tydliga rekommendationer, tät uppföljning och ett starkt
              fokus på hållbar leverans.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {values.map((value, index) => {
              const Icon = valueIcons[index];

              return (
                <Card
                  key={value.title}
                  className="border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {value.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-border bg-card p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Vill du se hur vi kan stötta ert team?
                </h2>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                  Vi tar gärna ett första möte där vi går igenom nuläge, mål och
                  vilka delar av er teknikmiljö som kräver mest uppmärksamhet.
                  Efter det kan vi rekommendera ett passande upplägg.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="active:scale-95 transition-all duration-200"
              >
                <Link href="/kontakt">
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}