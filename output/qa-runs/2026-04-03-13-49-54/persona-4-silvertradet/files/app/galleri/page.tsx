
import Link from "next/link";

import { ArrowRight, Eye, Layers as Layers3, Sparkles } from "lucide-react"




import { GalleryBrowser } from "@/components/gallery-browser";
import Image from "next/image";
import { createPageMetadata } from "@/lib/metadata";
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"


export const metadata = createPageMetadata({
  pageName: "Galleri",
  description:
    "Utforska Silverträdets galleri med handgjorda ringar, halsband, armband och örhängen i sterling silver. Filtrera kollektioner och hitta din favorit.",
  path: "/galleri",
});

const galleryNotes = [
  {
    title: "Produktbilder och detaljer",
    description:
      "Vi visar både hela smycken och närbilder på yta, struktur och finish. Det gör det enklare att förstå känslan i materialet innan du väljer.",
    icon: Eye,
  },
  {
    title: "Lätt att filtrera",
    description:
      "Sortera mellan ringar, halsband, armband och örhängen för att snabbt hitta rätt del av kollektionen.",
    icon: Layers3,
  },
  {
    title: "Samma lugna uttryck",
    description:
      "Oavsett kategori håller vi fast vid en sammanhållen formvärld med ljus fotografering och mjuka skuggor.",
    icon: Sparkles,
  },
];

export default function GalleriPage() {
  return (
    <div className="flex flex-col">
      <section className="border-b border-border/70 bg-gradient-to-b from-background to-muted/35 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="rounded-full px-4 py-1.5">
              Galleri
            </Badge>
            <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Ett galleri för att se smyckena nära, lugnt och tydligt
            </h1>
            <div className="max-w-2xl space-y-4 text-lg leading-8 text-muted-foreground">
              <p>
                Här kan du bläddra mellan ringar, halsband, armband och
                örhängen i vårt sortiment. Vi har blandat rena produktbilder med
                detaljbilder och lifestylefotografi så att du ska få en tydlig
                känsla för proportion, lyster och uttryck.
              </p>
              <p>
                Klicka på en bild för att öppna den i större format. Därifrån
                kan du fortsätta till priser eller kontakta oss om du vill ha
                hjälp att välja liknande smycken.
              </p>
            </div>
          </div>

          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=1000&fit=crop&q=80"
              alt="Närbild av silversmycke mot ljus stenbakgrund"
              width={900}
              height={1000}
              priority
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="section-shell">
          <div className="mb-8 max-w-3xl space-y-4">
            <Badge variant="secondary" className="rounded-full px-4 py-1.5">
              Filtrera kollektionen
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Utforska bilderna kategori för kategori
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              Börja brett eller gå direkt till en kategori som intresserar dig.
              Vi har valt en jämn och ljus bildstil för att du lättare ska kunna
              jämföra form, storlek och finish mellan olika modeller.
            </p>
          </div>

          <GalleryBrowser />
        </div>
      </section>

      <section className="bg-muted/40 py-16 sm:py-24">
        <div className="section-shell grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="silver-panel overflow-hidden p-3">
            <Image
              src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
              alt="Makrodetaljer av silver, polering och struktur"
              width={1100}
              height={900}
              className="h-auto w-full rounded-[1.5rem] object-cover"
            />
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <Badge variant="secondary" className="rounded-full px-4 py-1.5">
                Material och detaljer
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Det som inte alltid syns i första blicken
              </h2>
              <p className="text-lg leading-8 text-muted-foreground">
                I galleriet vill vi visa mer än bara den färdiga formen. Därför
                finns också bilder som fångar hamrad struktur, polerad yta och
                hur smyckena möter hud och tyg i naturligt ljus.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {galleryNotes.map((item) => (
                <Card
                  key={item.title}
                  className="rounded-[1.4rem] border-border/70 bg-card/95 shadow-sm"
                >
                  <CardContent className="space-y-4 p-5">
                    <item.icon className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold tracking-tight">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <p className="text-sm leading-7 text-muted-foreground">
              När du vill gå vidare från inspiration till val finns både priser
              och kontakt nära till hands. Vi hjälper gärna till om du vill
              hitta ett smycke som påminner om det du fastnat för här.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-16 sm:pb-24">
        <div className="section-shell">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Redo att välja ditt smycke?
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-primary-foreground/80">
                  När du hittat ett uttryck du gillar kan du gå vidare till
                  priserna eller höra av dig direkt för hjälp med val,
                  presentinslagning eller storlek.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Button asChild size="lg" variant="secondary" className="rounded-full">
                  <Link href="/kontakt">Handla smycken</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/20 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                >
                  <Link href="/priser">
                    Se priser
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}