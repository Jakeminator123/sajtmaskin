
import Link from "next/link";
import type { Metadata } from "next";



import { ArrowRight, Heart, Sparkles } from "lucide-react"



import { GalleryGrid, type GalleryItem } from "@/components/gallery-grid";
import Image from "next/image";
import { createPageMetadata } from "@/lib/site";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import SectionHeading from "@/components/section-heading"



export const metadata: Metadata = createPageMetadata({
  title: "Galleri",
  path: "/galleri",
  description:
    "Upptäck klippningar, färgresultat, styling och skäggvård från Klipp & Stil i Göteborg. Hitta inspiration och boka en tid som passar dig.",
});

const filters = ["Alla", "Klippning", "Färg", "Styling", "Skägg"];

const galleryItems: GalleryItem[] = [
  {
    id: "1",
    category: "Färg",
    title: "Mjuk balayage med glans",
    note: "Sömlös färg med varm ton och naturlig övergång mot botten för ett lättskött resultat.",
    image:
      "https://images.unsplash.com/photo-1608144717871-2dff5dc55d81?w=560&h=700&fit=crop&q=80",
    alt: "Färgresultat med mjuk balayage i dagsljus",
  },
  {
    id: "2",
    category: "Klippning",
    title: "Klassisk bob med ren linje",
    note: "En form som känns tydlig, lätt och enkel att bära både rakt och med naturlig rörelse.",
    image:
      "https://images.unsplash.com/photo-1760895535234-2c39c57cf187?w=560&h=700&fit=crop&q=80",
    alt: "Kort bobklippning med tydlig linje i ljus salong",
  },
  {
    id: "3",
    category: "Styling",
    title: "Föning med mjuk volym",
    note: "Luftig styling med rörelse och glans för vardag, middag eller fest.",
    image:
      "https://images.unsplash.com/photo-1612041719716-8db1f9a7de96?w=560&h=700&fit=crop&q=80",
    alt: "Föning med mjuk volym och glans",
  },
  {
    id: "4",
    category: "Färg",
    title: "Slingor med naturlig dimension",
    note: "Ljusare partier som lyfter helheten utan att resultatet känns randigt eller hårt.",
    image:
      "https://images.unsplash.com/photo-1612041714878-997e3fe9cd13?w=560&h=700&fit=crop&q=80",
    alt: "Slingor med naturlig dimension i dagsljus",
  },
  {
    id: "5",
    category: "Klippning",
    title: "Mjuka lager för mer rörelse",
    note: "Formen öppnar upp längderna och ger ett mer levande fall utan att tappa fyllighet.",
    image:
      "https://images.unsplash.com/photo-1652598886267-e41f4d7e9d31?w=560&h=700&fit=crop&q=80",
    alt: "Klippning med mjuka lager och rörelse",
  },
  {
    id: "6",
    category: "Skägg",
    title: "Skäggtrim med tydliga konturer",
    note: "Ren form och balanserad längd för ett välvårdat uttryck som är lätt att underhålla.",
    image:
      "https://images.unsplash.com/photo-1765893576852-1a7e762405f9?w=560&h=700&fit=crop&q=80",
    alt: "Skäggtrim med tydliga konturer",
  },
  {
    id: "7",
    category: "Färg",
    title: "Toning för djup och glans",
    note: "En uppfräschning som ger lyster och djup till färgen utan att kännas för tung.",
    image:
      "https://images.unsplash.com/photo-1723663123120-6d47b4fac665?w=560&h=700&fit=crop&q=80",
    alt: "Toning som ger djup och glans i håret",
  },
  {
    id: "8",
    category: "Styling",
    title: "Uppsättning med mjuk finish",
    note: "En avslappnad men arbetad styling som håller formen och känns elegant utan att bli stel.",
    image:
      "https://images.unsplash.com/photo-1617125203718-668061bd0429?w=560&h=700&fit=crop&q=80",
    alt: "Uppsättning med mjuk och elegant finish",
  },
  {
    id: "9",
    category: "Klippning",
    title: "Long bob med luftig känsla",
    note: "Ett populärt snitt för dig som vill behålla längd men få mer struktur och skärpa.",
    image:
      "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=560&h=700&fit=crop&q=80",
    alt: "Long bob med luftig struktur i ljus salong",
  },
];

export default function GalleryPage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Galleri
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Inspiration från salongen, samlad i ett levande urval
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Utforska ett urval av klippningar, färgningar, styling och skäggvård från salongen. Hittar du något du gillar kan du boka direkt och skriva en kort referens i meddelandet, så vet vi bättre vilken känsla du är ute efter.
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
                <Link href="/priser">Se priser</Link>
              </Button>
            </div>
          </div>

          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
                alt="Galleriöversikt med hårfärg och styling i ljus salong"
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
        <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Utvalda resultat"
            title="Filtrera efter det du är mest nyfiken på"
            description="I galleriet hittar du allt från färgnyanser och slingor till bob, mjuka lager, styling och skäggkonturer. Klicka på en bild för att se den större och få en kort beskrivning av känslan bakom resultatet."
          />

          <GalleryGrid items={galleryItems} filters={filters} />
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Kundfavoriter"
              title="Många bokar efter att ha hittat sin känsla i galleriet"
              description="Många bokar hos oss efter att ha sett färgresultaten i galleriet och känt att uttrycket stämmer med det de själva söker. Spara gärna en favorit i minnet och visa den vid ditt besök, så blir samtalet om mål och riktning enklare direkt."
            />
            <Button asChild size="lg" className="rounded-full transition-all duration-200 active:scale-95">
              <Link href="/boka">Boka tid</Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="muted-shell p-5">
              <Heart className="h-5 w-5 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Färg med djup</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Naturliga nyanser med glans är ofta det kunder sparar först när de vill ha en tydlig men mjuk förändring.
              </p>
            </div>
            <div className="muted-shell p-5">
              <Sparkles className="h-5 w-5 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Styling med lätthet</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Många uppskattar styling som känns genomarbetad men fortfarande enkel och mjuk i uttrycket.
              </p>
            </div>
            <div className="muted-shell p-5">
              <ArrowRight className="h-5 w-5 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">Visa en referens</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                När vi har en gemensam bild att utgå från blir det lättare att hitta rätt nivå i både form, nyans och finish.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[2rem] bg-accent px-6 py-10 text-accent-foreground sm:px-10 lg:px-12">
            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div className="space-y-4">
                <Badge className="rounded-full bg-background/15 px-4 py-1 text-accent-foreground hover:bg-background/15">
                  Vill du ha något liknande?
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Boka en tid och berätta vad du vill uppnå
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-accent-foreground/85">
                  Vi anpassar alltid efter ditt hår, din vardag och hur mycket underhåll som känns rimligt för dig. Ju tydligare vi förstår din känsla, desto bättre kan vi forma rätt resultat tillsammans.
                </p>
              </div>

              <div className="section-shell bg-background/92 p-6 text-foreground">
                <h3 className="text-2xl font-semibold">Börja med en bokning eller en fråga</h3>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Du kan boka direkt om du vet vad du vill göra, eller kontakta oss om du vill ha hjälp att välja tjänst innan du bestämmer dig.
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