
import Link from "next/link";
import type { Metadata } from "next";



import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react"




import { ContactForm } from "@/components/contact-form";
import Image from "next/image";
import { createPageMetadata, googleMapsUrl, siteConfig } from "@/lib/site";
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import SectionHeading from "@/components/section-heading"
import MapEmbed from "@/components/map-embed"




export const metadata: Metadata = createPageMetadata({
  title: "Kontakt",
  path: "/kontakt",
  description:
    "Kontakta Klipp & Stil i Göteborg för frågor om tider, priser och tjänster. Här hittar du formulär, telefon, e-post, adress och karta.",
});

export default function ContactPage() {
  return (
    <main className="pb-16 pt-28 sm:pb-24">
      <section className="pb-16 pt-6 sm:pb-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="space-y-8">
            <Badge className="rounded-full bg-secondary/30 px-4 py-1 text-primary hover:bg-secondary/30">
              Kontakta oss
            </Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Frågor om tider, priser eller rätt behandling?
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                Har du frågor om tjänster, priser eller vill du få hjälp att välja rätt? Hör av dig så svarar vi så snart vi kan, eller boka direkt online när du vet vad du vill göra.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="rounded-full transition-all duration-200 active:scale-95">
                <Link href="/boka">Boka tid</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                <a href="#kontaktform">Skicka meddelande</a>
              </Button>
            </div>
          </div>

          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1100&h=900&fit=crop&q=80"
                alt="Varm och inbjudande salongsinteriör med naturligt ljus"
                width={1100}
                height={900}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="kontaktform" className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
          <div className="section-shell p-6 sm:p-8">
            <SectionHeading
              eyebrow="Kontaktformulär"
              title="Skicka ett meddelande så återkommer vi"
              description="Skriv gärna några rader om vad du funderar på eller vilken behandling du är intresserad av. Ju mer vi vet från början, desto bättre kan vi ge ett tydligt och hjälpsamt svar."
            />
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
              <CardContent className="space-y-5 p-6">
                <h2 className="text-2xl font-semibold">Direktkontakt</h2>
                <div className="space-y-4 text-sm leading-7 text-muted-foreground">
                  <p className="flex items-start gap-3">
                    <Phone className="mt-1 h-4 w-4 text-accent" />
                    <a href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`} className="transition-colors hover:text-foreground">
                      {siteConfig.phone}
                    </a>
                  </p>
                  <p className="flex items-start gap-3">
                    <Mail className="mt-1 h-4 w-4 text-accent" />
                    <a href={`mailto:${siteConfig.email}`} className="transition-colors hover:text-foreground">
                      {siteConfig.email}
                    </a>
                  </p>
                  <p className="flex items-start gap-3">
                    <MapPin className="mt-1 h-4 w-4 text-accent" />
                    <span>
                      {siteConfig.address.street}, {siteConfig.address.postalCode} {siteConfig.address.city}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
              <CardContent className="space-y-4 p-6">
                <h2 className="text-2xl font-semibold">Öppettider</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Vi tar emot bokade besök under veckan och på lördagar enligt tiderna nedan. Kom gärna några minuter innan din tid så att besöket kan börja lugnt och utan stress.
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Mån–Fre 10–18</p>
                  <p>Lör 10–14</p>
                </div>
                <Button asChild variant="outline" className="rounded-full transition-all duration-200 active:scale-95">
                  <Link href="/boka">Boka tid</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <MapEmbed title="Karta till Klipp & Stil i Göteborg" />

          <Card className="rounded-[1.9rem] border-border/70 bg-card/90 shadow-sm">
            <CardContent className="space-y-5 p-6">
              <h2 className="text-2xl font-semibold">Besöksadress</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Du hittar oss på Storgatan 12 i Göteborg, nära centrala delar av staden och lätt att känna igen när du väl är på plats. Kom gärna några minuter innan din tid så hinner du landa innan vi börjar.
              </p>
              <p className="text-sm leading-7 text-muted-foreground">
                Om du reser kollektivt eller promenerar genom centrum är det enkelt att ta sig hit. Har du svårt att hitta rätt går det bra att ringa så guidar vi dig sista biten.
              </p>
              <Button asChild className="rounded-full transition-all duration-200 active:scale-95">
                <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                  Öppna i Google Maps
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="section-shell warm-panel overflow-hidden p-3">
            <div className="relative overflow-hidden rounded-[1.7rem]">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=950&h=850&fit=crop&q=80"
                alt="Exteriör och miljödetalj från salongen i varm nordisk stil"
                width={950}
                height={850}
                className="h-auto w-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-6">
            <SectionHeading
              eyebrow="Följ oss"
              title="Se inspiration, nyheter och tider vi släpper löpande"
              description="På våra sociala kanaler delar vi inspiration från salongen, uppdateringar om tider och glimtar från vardagen bakom stolen. Det är också ett bra sätt att få en känsla för vår stil innan du bokar."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                href={siteConfig.socials[0].href}
                target="_blank"
                rel="noreferrer"
                className="muted-shell block p-5 transition-all duration-200 hover:border-accent/30 hover:shadow-sm"
              >
                <Instagram className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-lg font-semibold">Instagram</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{siteConfig.socials[0].handle}</p>
              </a>
              <a
                href={siteConfig.socials[1].href}
                target="_blank"
                rel="noreferrer"
                className="muted-shell block p-5 transition-all duration-200 hover:border-accent/30 hover:shadow-sm"
              >
                <Facebook className="h-5 w-5 text-accent" />
                <h2 className="mt-4 text-lg font-semibold">Facebook</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{siteConfig.socials[1].handle}</p>
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}