import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { ProjectCard } from "@/components/project-card";

const projects = [
  {
    title: "[Projektnamn 1]",
    category: "Varumärkessajt",
    description: "En lagrad studiosajt med varmare redaktionell känsla, med fokus på tydlighet, omdömen och förfrågningskvalitet.",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=900&h=700&fit=crop",
  },
  {
    title: "[Projektnamn 2]",
    category: "Produktlansering",
    description: "En lanseringssida för ett designverktyg, byggd kring produktberättelse, täta UI-skärmdumpar och prisdriven konvertering.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=900&h=700&fit=crop",
  },
  {
    title: "[Projektnamn 3]",
    category: "Portfolio + text",
    description: "En personlig sajt som balanserar projektcase med lättare essäer och en mer reflekterande ton.",
    image: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=900&h=700&fit=crop",
  },
];

const experience = [
  { role: "Oberoende designer & utvecklare", period: "2022—nu", note: "Designsystem, produktsajter och lanseringar mot grundare." },
  { role: "Lead produktdesigner", period: "2019—2022", note: "Arbetade med onboarding, tillväxtförsök och plattformsnavigering." },
  { role: "Front-end-konsult", period: "2016—2019", note: "Hjälpte team att förvandla grov riktning till användbara och trovärdiga gränssnitt." },
];

const writing = [
  "Designa lugnare produktytor för upptagna team",
  "Vad får en portfolio att kännas specifik i stället för utbytbar",
  "Tre sätt att förbättra en landningssida innan du lägger till fler funktioner",
];

export default function HomePage() {
  return (
    <div className="px-6 py-16 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-6xl space-y-20">
        <section className="space-y-8">
          <div className="relative overflow-hidden rounded-4xl">
            <Image
              src={projects[0].image}
              alt={projects[0].title}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 72rem, 100vw"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/55 to-background/10" />
            <div className="relative z-10 flex min-h-[28rem] flex-col justify-end space-y-6 p-6 sm:min-h-[32rem] sm:p-10">
              <Badge className="rounded-full px-3 py-1">Portfoliostart</Badge>
              <div className="max-w-3xl space-y-4">
                <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
                  En personlig sajt med starkare arbete, text och trovärdighetsstruktur.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                  Inspirerad av renare portfolioreferenser ger den här starten en skarpare form för kreatörer,
                  konsulter, fotografer eller små studior som behöver en sajt med personlighet.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="rounded-full px-7">
                  Visa utvalt arbete <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-7">
                  Läs texter
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="work" className="space-y-8">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">Utvalt arbete</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Projektkort som redan känns som case studies</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Byt ut titlar, bilder och beskrivningar mot användarens eget arbete, men behåll rytm och avstånd.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.title} {...project} />
            ))}
          </div>
        </section>

        <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <Badge variant="secondary" className="rounded-full">Erfarenhet</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">Trovärdighet utan att bli en företagssida</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Portfolion ska fortfarande kännas personlig. Använd den här sektionen för erfarenhet, utvalda roller, utmärkelser eller kundkategorier.
            </p>
          </div>
          <div className="space-y-4">
            {experience.map((item) => (
              <Card key={item.role} className="rounded-[1.6rem] border bg-card/80">
                <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{item.role}</p>
                    <p className="text-sm leading-7 text-muted-foreground">{item.note}</p>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-full">{item.period}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-10 rounded-4xl border bg-card/70 p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">Text</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">En portfolio som också kan bära idéer</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Inspirerad av portfolio-plus-blogg-referenser. Det ger modellen en självklar plats för essäer, anteckningar eller case-tänk.
            </p>
          </div>
          <div className="space-y-3">
            {writing.map((post) => (
              <a
                key={post}
                href="#"
                className="block rounded-[1.4rem] border bg-background/85 px-5 py-4 transition-all hover:border-primary/30 hover:shadow-sm"
              >
                <p className="font-medium">{post}</p>
                <p className="mt-1 text-sm text-muted-foreground">Använd den här platsen för essäer, projektanteckningar eller redaktionellt innehåll.</p>
              </a>
            ))}
          </div>
        </section>

        <section className="rounded-4xl border bg-linear-to-br from-accent/80 via-background to-primary/10 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">Kontakt</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Gör det enkelt att starta samtalet</h2>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Personliga portfolios fungerar bäst när sajten avslutas med ett tydligt nästa steg: kontakt, bokning, förfrågan eller tillgänglighet.
              </p>
            </div>
            <div className="rounded-3xl bg-background/85 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">Tillgänglighet</p>
              <p className="mt-2 text-2xl font-semibold">Bokar utvalda projekt för Q3</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Byt ut det här budskapet, CTA:n och kontaktuppgifterna så det passar personen, studion eller praktiken.
              </p>
              <Button className="mt-6 rounded-full" size="lg">
                Säg hej <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
