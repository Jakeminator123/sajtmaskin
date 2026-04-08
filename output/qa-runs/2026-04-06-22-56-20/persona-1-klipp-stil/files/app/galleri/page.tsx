
import type { Metadata } from "next";





import { GalleryLightbox } from "@/components/gallery-lightbox";

import { galleryItems } from "@/lib/site-data";
import Image from "next/image";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"
import CtaBanner from "@/components/cta-banner"

export const metadata: Metadata = {
  title: "Klipp & Stil — Galleri med klippningar, färgningar och stylingar",
  description:
    "Bläddra bland resultat från Klipp & Stil i Göteborg. Upptäck klippningar, färgningar, stylingar och skäggvård i ett inspirerande bildgalleri.",
  keywords: [
    "frisör galleri Göteborg",
    "balayage Göteborg",
    "klippning inspiration Göteborg",
    "styling galleri Göteborg",
    "Klipp & Stil galleri",
  ],
  openGraph: {
    title: "Klipp & Stil — Galleri med klippningar, färgningar och stylingar",
    description:
      "Bläddra bland resultat från Klipp & Stil i Göteborg. Upptäck klippningar, färgningar, stylingar och skäggvård i ett inspirerande bildgalleri.",
    locale: "sv_SE",
    type: "website",
  },
};

const processItems = [
  {
    title: "Konsultation först",
    description:
      "Varje resultat börjar med frågor om form, ton, underhåll och känsla. Det gör att inspirationen blir personlig i stället för generell.",
  },
  {
    title: "Teknik som passar håret",
    description:
      "Vi väljer metod efter hårkvalitet, utgångsläge och hur stor förändring du vill göra. På så sätt får du både lyster och hållbarhet.",
  },
  {
    title: "Finish som håller",
    description:
      "Vi avslutar alltid med styling och tydliga råd om hur du kan behålla formen hemma. Målet är att resultatet ska kännas lika rätt även om två veckor.",
  },
];

export default function GalleryPage() {
  return (
    <div className="flex flex-col">
      <section className="bg-gradient-to-b from-background to-muted/40 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
          <div className="flex flex-col justify-center gap-6">
            <Badge
              variant="secondary"
              className="w-fit rounded-full border border-primary/15 bg-background px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
            >
              Galleri
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Resultat från salongen, från mjuka färger till precisa former
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Här ser du ett urval av arbeten från salongen — från mjuka
                balayager och precisa bobklippningar till feststyling och
                skäggvård. Alla resultat börjar med en konsultation där vi går
                igenom form, ton, underhåll och vad som faktiskt passar din vardag.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-xl">
            <Image
              src="/placeholder.svg?height=850&width=1000&text=Frisör+som+stylar+glansigt+hår+i+ljus+salongsmiljö"
              alt="Frisör som stylar glansigt hår i ljus salongsmiljö"
              width={1000}
              height={850}
              priority
              className="h-full w-full object-cover"
              sizes="(min-width: 1024px) 55vw, 100vw"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Portfolio"
            title="Filtrera efter det du är nyfiken på"
            description="Välj mellan klippning, färgning, styling och skäggvård för att hitta uttryck som liknar det du själv är ute efter. Klicka på en bild för att se den större i vår lightbox."
            align="center"
          />

          <GalleryLightbox items={galleryItems} />
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24 lg:py-32">
        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Arbetssätt"
            title="Bakom varje bild finns ett lugnt och genomtänkt hantverk"
            description="För oss handlar inspiration inte om att kopiera en trend rakt av, utan om att översätta en känsla till något som fungerar för just din hårtyp, stil och vardag."
            align="center"
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {processItems.map((item) => (
              <Card key={item.title} className="rounded-[2rem] border-border bg-card shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {item.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Din stil"
        title="Sett något i galleriet som känns nära det du vill ha?"
        description="Boka en tid eller skriv några rader i bokningen om vilken bild och känsla du fastnade för. Vi hjälper dig att hitta rätt väg dit med ett resultat som passar dig och ditt hår."
        primaryHref="/boka"
        primaryLabel="Boka tid"
        secondaryHref="/kontakt"
        secondaryLabel="Kontakta oss"
      />
    </div>
  );
}