
import Link from "next/link";
import type { Metadata } from "next";

import { Clock3, Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react"


import { ContactForm } from "@/components/contact-form";



import { businessInfo, createMetadata, socialLinks } from "@/lib/site";
import { Button } from "@/components/ui/button"
import PageHero from "@/components/page-hero"
import SectionHeading from "@/components/section-heading"
import MapEmbed from "@/components/map-embed"

export const metadata: Metadata = createMetadata({
  title: "Kontakt",
  description:
    "Kontakta Klipp & Stil i Göteborg för frågor om behandling, tider och bokning. Här hittar du formulär, telefon, e-post, adress och karta.",
  path: "/kontakt",
});

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Kontakt"
        title="Har du frågor inför bokning eller vill du ha råd om behandling?"
        description="Har du frågor om behandling, tider eller vill du ha råd innan du bokar? Hör av dig så hjälper vi dig. Du kan också ringa direkt om det gäller något brådskande eller om du vill ha snabbast möjliga svar."
        imageSrc="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&h=1200&fit=crop&q=80"
        imageAlt="Salongens mottagningsyta i varmt naturligt ljus"
        primaryAction={{ label: `Ring ${businessInfo.phone}`, href: businessInfo.phoneHref }}
        secondaryAction={{ label: "Boka tid", href: "/boka" }}
        details={[
          { label: "Telefon", value: businessInfo.phone },
          { label: "E-post", value: businessInfo.email },
          { label: "Adress", value: `${businessInfo.address}, ${businessInfo.city}` },
        ]}
        note="Kom gärna 5 minuter innan din tid. Hör av dig om du har särskilda behov så försöker vi ordna en smidig lösning."
      />

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="paper-panel-strong p-6 sm:p-8">
            <SectionHeading
              eyebrow="Kontaktformulär"
              title="Skicka ett meddelande så återkommer vi så snart vi kan"
              description="Formuläret passar bra om du vill ställa en fråga, få råd om behandling eller höra av dig kring bokning. Vi använder dina uppgifter för att svara på din fråga."
            />
            <div className="mt-8">
              <ContactForm />
            </div>
          </div>

          <div className="space-y-6">
            <div className="paper-panel p-6">
              <h2 className="text-2xl font-semibold tracking-tight">Direktkontakt</h2>
              <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3 rounded-[1.25rem] border bg-background/80 p-4">
                  <Phone className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Telefon</h3>
                    <a href={businessInfo.phoneHref} className="mt-1 block text-sm leading-7 text-muted-foreground hover:text-foreground">
                      {businessInfo.phone}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[1.25rem] border bg-background/80 p-4">
                  <Mail className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">E-post</h3>
                    <a href={businessInfo.emailHref} className="mt-1 block text-sm leading-7 text-muted-foreground hover:text-foreground">
                      {businessInfo.email}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[1.25rem] border bg-background/80 p-4">
                  <MapPin className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Adress</h3>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">
                      {businessInfo.address}, {businessInfo.postalCode} {businessInfo.city}
                    </p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      Nära kollektivtrafik och promenadavstånd från centrala Göteborg.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[1.25rem] border bg-background/80 p-4">
                  <Clock3 className="mt-1 h-5 w-5 text-primary" />
                  <div>
                    <h3 className="text-lg font-semibold">Öppettider</h3>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">Mån–Fre 10–18, Lör 10–14</p>
                    <p className="text-sm leading-7 text-muted-foreground">Kom gärna 5 minuter innan din tid.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] bg-primary p-6 text-primary-foreground">
              <p className="text-sm uppercase tracking-[0.18em] text-primary-foreground/70">Snabbast väg</p>
              <p className="mt-3 text-base leading-7 text-primary-foreground/85">
                Om du vill ha snabbast möjliga svar på tider eller samma-dag-bokning rekommenderar vi att du ringer oss direkt.
              </p>
              <Button asChild variant="secondary" className="mt-6 rounded-full">
                <a href={businessInfo.phoneHref}>Ring nu</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/45 py-16 sm:py-24">
        <div className="section-shell">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Besöksadress och karta"
                title="Hitta hit enkelt, oavsett om du kommer från jobbet eller hemifrån"
                description="Vi finns på Storgatan 12 i Göteborg med smidigt läge nära kollektivtrafik. Hör gärna av dig om du har särskilda behov så försöker vi ordna en så enkel lösning som möjligt."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border bg-card/80 p-5">
                  <h3 className="text-lg font-semibold">Resa hit</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Spårvagn och buss finns nära, och det är enkelt att promenera från centrala Göteborg.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border bg-card/80 p-5">
                  <h3 className="text-lg font-semibold">Tillgänglighet</h3>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                    Hör av dig om du har särskilda behov så försöker vi ordna en smidig lösning inför ditt besök.
                  </p>
                </div>
              </div>
            </div>

            <MapEmbed title="Karta till salongen Klipp & Stil" />
          </div>
        </div>
      </section>

      <section className="section-shell py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <SectionHeading
              eyebrow="Följ oss"
              title="Se mer från salongen och håll koll på nya tider"
              description="På sociala medier delar vi glimtar från salongen, inspiration och resultat från olika behandlingar. Där får du också en ännu tydligare känsla för vårt uttryck och vår vardag."
            />
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/boka">Boka tid</Link>
            </Button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <a
              href={socialLinks[0].href}
              target="_blank"
              rel="noreferrer"
              className="paper-panel p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md"
              aria-label={`Följ oss på Instagram, ${socialLinks[0].handle}`}
            >
              <Instagram className="h-6 w-6 text-primary" />
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">Instagram</h3>
              <p className="mt-2 text-base leading-7 text-muted-foreground">{socialLinks[0].handle}</p>
            </a>

            <a
              href={socialLinks[1].href}
              target="_blank"
              rel="noreferrer"
              className="paper-panel p-6 transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md"
              aria-label={`Följ oss på Facebook, ${socialLinks[1].handle}`}
            >
              <Facebook className="h-6 w-6 text-primary" />
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">Facebook</h3>
              <p className="mt-2 text-base leading-7 text-muted-foreground">{socialLinks[1].handle}</p>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}