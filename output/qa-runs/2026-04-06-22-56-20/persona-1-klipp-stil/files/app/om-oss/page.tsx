
import type { Metadata } from "next";


import { Heart, Scissors, Sparkles, Users } from "lucide-react";





import { teamMembers, values } from "@/lib/site-data";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"
import CtaBanner from "@/components/cta-banner"

export const metadata: Metadata = {
  title: "Klipp & Stil — Om oss och teamet bakom salongen i Göteborg",
  description:
    "Lär känna teamet på Klipp & Stil i Göteborg. Läs om vår historia, våra värderingar och hur vi arbetar med klippning, färgning, styling och skäggvård.",
  keywords: [
    "om oss frisör Göteborg",
    "team frisörsalong Göteborg",
    "Klipp & Stil om oss",
    "personlig frisör Göteborg",
    "frisörteam Göteborg",
  ],
  openGraph: {
    title: "Klipp & Stil — Om oss och teamet bakom salongen i Göteborg",
    description:
      "Lär känna teamet på Klipp & Stil i Göteborg. Läs om vår historia, våra värderingar och hur vi arbetar med klippning, färgning, styling och skäggvård.",
    locale: "sv_SE",
    type: "website",
  },
};

const valueIcons = [Heart, Sparkles, Users];

export default function AboutPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="flex flex-col justify-center gap-6">
            <Badge
              variant="secondary"
              className="w-fit rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
            >
              Om Klipp & Stil
            </Badge>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                En varm salong byggd kring lyhördhet, hantverk och hållbara resultat
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Vi ville skapa en plats där rådgivning får ta tid och där varje
                behandling känns genomtänkt från första samtalet till sista
                stylingprodukten. Hos oss möter du ett litet team som kombinerar
                teknisk skicklighet med ett lugnt och personligt sätt att arbeta.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <Image
              src="/placeholder.svg?height=900&width=1000&text=Frisörteam+i+varm+och+personlig+salong+i+Göteborg"
              alt="Frisörteam i varm och personlig salong i Göteborg"
              width={1000}
              height={900}
              priority
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Vår historia"
              title="Från storstadstempo till en mer personlig salongsupplevelse"
              description="Klipp & Stil grundades av Johanna Lindberg efter flera år på större citysalonger där tempot ofta gick före samtalet. Hon ville skapa en plats där rådgivningen får ta tid och där varje kund får ett resultat som faktiskt passar vardagen lika bra som spegelbilden direkt efter besöket."
            />
            <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
              I dag är salongen ett litet team med bred kompetens inom klippning,
              färgning, styling och skäggvård. Vi tar emot stamkunder, nya
              göteborgare och dig som vill göra en större förändring med trygg
              vägledning hela vägen.
            </p>
          </div>

          <Card className="rounded-[2rem] border-border bg-card shadow-sm">
            <CardContent className="space-y-6 p-8">
              <div className="flex items-center gap-3">
                <Scissors className="h-5 w-5 text-primary" />
                <h2 className="text-2xl font-semibold tracking-tight">Det som präglar oss</h2>
              </div>

              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-semibold">Trygg konsultation</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Vi börjar alltid med att prata igenom form, ton, underhåll och
                    vad du faktiskt vill att håret ska göra i vardagen.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Tydligt hantverk</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Våra tekniker väljs för att ge rena linjer, mjuka övergångar
                    och ett resultat som håller fint mellan besöken.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Lugn atmosfär</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Vi vill att varje besök ska kännas som en paus i dagen, inte
                    som ännu en punkt på att-göra-listan.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Teamet"
            title="Tre personer med olika styrkor och samma syn på bemötande"
            description="Vi arbetar nära varandra och delar samma övertygelse: ett bra resultat börjar med att förstå personen i stolen. Därför möts teknik, erfarenhet och lyhördhet i varje behandling."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {teamMembers.map((member) => (
              <Card
                key={member.name}
                className="rounded-[2rem] border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="space-y-5 p-6">
                  <div className="overflow-hidden rounded-[1.5rem] border border-border">
                    <Image
                      src={member.image}
                      alt={member.alt}
                      width={480}
                      height={600}
                      className="h-auto w-full object-cover"
                      sizes="(min-width: 1024px) 33vw, 100vw"
                    />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold tracking-tight">
                      {member.name}
                    </h3>
                    <p className="text-sm font-medium uppercase tracking-[0.14em] text-primary">
                      {member.role}
                    </p>
                  </div>

                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {member.bio}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {member.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Värderingar"
            title="Så arbetar vi när någon sätter sig i stolen hos oss"
            description="Vår salongskänsla handlar inte bara om inredning och musik, utan om hur vi tar beslut under själva behandlingen. Vi vill att du ska känna dig trygg, välinformerad och sedd från början till slut."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {values.map((value, index) => {
              const Icon = valueIcons[index];

              return (
                <Card
                  key={value.title}
                  className="rounded-[2rem] border-border bg-card shadow-sm"
                >
                  <CardContent className="space-y-4 p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight">
                      {value.title}
                    </h3>
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

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg">
            <Image
              src="/placeholder.svg?height=850&width=950&text=Salongsinteriör+med+varma+toner+speglar+och+bekväma+stolar"
              alt="Salongsinteriör med varma toner, speglar och bekväma stolar"
              width={950}
              height={850}
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>

          <div className="flex flex-col justify-center gap-6">
            <SectionHeading
              eyebrow="Salongen"
              title="Mitt i Göteborg, men med en känsla av att tiden saktar ner"
              description="Vi har byggt salongen för att den ska kännas varm, stillsam och lätt att trivas i. Här finns plats för både små vardagsbesök och större förändringar som behöver mer tid, fler frågor och ett lugnare tempo."
            />
            <p className="text-lg leading-relaxed text-muted-foreground">
              Oavsett om du kommer för en snabb toppning eller en längre
              färgbehandling vill vi att du ska gå härifrån med samma känsla:
              att du blivit väl omhändertagen och fått ett resultat som känns helt rätt.
            </p>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Nästa steg"
        title="Vill du träffa teamet och boka din första tid hos oss?"
        description="Skicka en bokningsförfrågan online så hjälper vi dig till rätt behandling och rätt person i teamet. Du är också varmt välkommen att höra av dig om du vill diskutera en större förändring först."
        primaryHref="/boka"
        primaryLabel="Boka tid"
        secondaryHref="/kontakt"
        secondaryLabel="Kontakta oss"
      />
    </div>
  );
}