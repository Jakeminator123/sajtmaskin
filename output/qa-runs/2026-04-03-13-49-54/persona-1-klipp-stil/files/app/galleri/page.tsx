
import Link from "next/link";
import type { Metadata } from "next";


import { ArrowRight, Circle as Blend, Frame, Layers as Layers3 } from "lucide-react"


import { GalleryGrid } from "@/components/gallery-grid";


import { createMetadata, galleryItems } from "@/lib/site";
import Image from "next/image";
import { Button } from "@/components/ui/button"
import PageHero from "@/components/page-hero"
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Galleri",
  description:
    "Utforska galleriet hos Klipp & Stil i Göteborg. Se klippningar, färgningar, styling och skäggvård med varm salongskänsla och naturliga resultat.",
  path: "/galleri",
});

const philosophy = [
  {
    title: "Naturliga övergångar",
    description:
      "Vi arbetar gärna med mjuka skiftningar och färger som känns levande i olika ljus. Resultatet ska vara snyggt både nygjort och när det växer ut.",
    icon: Blend,
  },
  {
    title: "Form som håller",
    description:
      "En klippning ska fungera i vardagen, inte bara precis efter besöket. Därför lägger vi stor vikt vid form, rörelse och hur håret faller naturligt.",
    icon: Frame,
  },
  {
    title: "Finish med lätthet",
    description:
      "Vi gillar en polerad känsla utan att håret tappar mjukhet. Finishen ska stötta uttrycket, inte kännas tung eller överarbetad.",
    icon: Layers3,
  },
];

export default function GalleryPage() {
  return (
    <>
      <PageHero
        eyebrow="Galleri"
        title="Resultat från Klipp & Stil med naturlig känsla och tydlig finish"
        description="Utforska ett urval av våra klippningar, färgningar och stylingar. Här ser du exempel på naturliga nyanser, mjuka övergångar och finish som håller. Klicka på en bild för att se större."
        imageSrc="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Närbild på hår med mjuka slingor och varm glans"
        primaryAction={{ label: "Boka tid", href: "/boka" }}
        secondaryAction={{ label: "Se priser", href: "/priser" }}
        details={[
          { label: "Kategorier", value: "Klippning, färgning, styling och skägg" },
          { label: "Visning", value: "Filter och lightbox direkt på sidan" },
          { label: "Känsla", value: "Dokumentärt, varmt och polerat" },
        ]}
        note="Vi anpassar alltid resultatet efter hårkvalitet, utgångsläge och hur mycket underhåll du vill lägga hemma."
      />

      <section className="section-shell py-16 sm:py-24">
        <SectionHeading
          eyebrow="Bildgalleri"
          title="Se exempel på vårt arbete i olika uttryck och behandlingar"
          description="Galleriet visar ett urval av resultat från salongen. Här får du en tydligare känsla för hur vi arbetar med form, färg, textur och finish i både små och större förändringar."
        />
        <div className="mt-10">
          <GalleryGrid items={galleryItems} />
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <div className="grid gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
            <div className="paper-panel-strong overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-muted sm:aspect-[5/4]">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=720&h=900&fit=crop&q=80"
                  alt="Närbild på hårtextur och mjuka vågor i varmt ljus"
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="space-y-6">
              <SectionHeading
                eyebrow="Vår stilkänsla"
                title="Vi arbetar för att resultatet ska kännas bärbart, mjukt och genomtänkt"
                description="Det som syns i galleriet är inte bara teknik, utan också vårt sätt att tänka. Vi vill att håret ska röra sig fint, färgen kännas harmonisk och helheten fungera i verkliga livet – inte bara på bild."
              />
              <div className="grid gap-4">
                {philosophy.map((item) => (
                  <article key={item.title} className="rounded-[1.5rem] border bg-card/80 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
                        <p className="mt-2 text-base leading-7 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell py-8 sm:py-12">
        <div className="rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.22em] text-primary-foreground/70">Liknande resultat</p>
              <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Vill du ha en look med samma mjukhet och precision?
              </h2>
              <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                Vi anpassar alltid behandling efter hårkvalitet, utgångsläge och hur mycket underhåll du vill lägga hemma. Tillsammans hittar vi en nivå som känns snygg, rimlig och hållbar över tid.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Button asChild size="lg" variant="secondary" className="rounded-full">
                <Link href="/boka">
                  Boka tid
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                <Link href="/priser">Se priser</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}