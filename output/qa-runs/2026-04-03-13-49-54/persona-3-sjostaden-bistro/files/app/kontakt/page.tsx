
import type { Metadata } from "next";

import { Facebook, Instagram, Mail, MapPin, Phone, Truck } from "lucide-react";

import { ContactForm } from "@/components/contact-form";

import { createMetadata, openingHours, siteConfig, socialLinks } from "@/lib/site-data";
import Image from "next/image";
import SectionHeading from "@/components/section-heading"

export const metadata: Metadata = createMetadata({
  title: "Kontakt",
  description:
    "Kontakta Sjöstaden Bistro om bokning, catering, allergier eller samarbeten. Här hittar du formulär, direktkontakt och öppettider.",
  path: "/kontakt",
});

export default function ContactPage() {
  return (
    <div className="overflow-x-hidden">
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-primary/80">Kontakt</p>
            <h1 className="max-w-3xl text-5xl tracking-tight sm:text-6xl">
              Hör av dig om bokning, catering eller allergier
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Hör av dig med frågor om bokning, catering eller allergier. Vi svarar så snabbt vi kan
              under öppettider. Du kan också ringa oss för snabbast hjälp.
            </p>
          </div>

          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=900&fit=crop&q=80"
                alt="Barhörna med dämpad belysning, varma metaller och skandinavisk bistrolux"
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Kontaktformulär"
              title="Skicka ett meddelande så återkommer vi inom kort"
              description="Använd formuläret för allmänna frågor, catering, press eller samarbeten. För catering: skriv gärna datum, ungefärligt antal och om du vill ha leverans eller upphämtning."
            />
            <ContactForm />
          </div>

          <aside className="space-y-6">
            <div className="surface-panel p-6">
              <h2 className="text-2xl tracking-tight">Direktkontakt</h2>
              <div className="mt-5 space-y-4">
                <a
                  href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/65 p-4 transition-colors hover:border-primary/25"
                >
                  <Phone className="mt-0.5 h-5 w-5 text-primary" />
                  <span>
                    <span className="block text-lg tracking-tight text-foreground">Telefon</span>
                    <span className="text-sm text-muted-foreground">{siteConfig.phone}</span>
                  </span>
                </a>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/65 p-4 transition-colors hover:border-primary/25"
                >
                  <Mail className="mt-0.5 h-5 w-5 text-primary" />
                  <span>
                    <span className="block text-lg tracking-tight text-foreground">E-post</span>
                    <span className="text-sm text-muted-foreground">{siteConfig.email}</span>
                  </span>
                </a>
                <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/65 p-4">
                  <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                  <span>
                    <span className="block text-lg tracking-tight text-foreground">Adress</span>
                    <span className="text-sm text-muted-foreground">{siteConfig.fullAddress}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="surface-panel overflow-hidden p-3">
              <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-primary/15">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=700&fit=crop&q=80"
                  alt="Cateringuppläggning med små rätter, texturer och elegant servering på mörk bakgrund"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="bg-muted/35 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Öppettider"
              title="När du enklast når oss"
              description="Vi svarar på mejl och formulär löpande under öppettider. För samma dag-bokningar och snabba frågor rekommenderar vi alltid telefon."
            />
            <div className="grid gap-4">
              {openingHours.map((slot) => (
                <article key={slot.label} className="surface-panel p-5">
                  <h2 className="text-2xl tracking-tight">{slot.label}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{slot.hours}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="surface-panel p-6 sm:p-8">
            <h2 className="text-3xl tracking-tight">Direkt för catering och samarbeten</h2>
            <div className="mt-6 space-y-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                För catering hjälper det oss om du skriver datum, ungefärligt antal personer och om
                du vill ha leverans eller upphämtning. Då kan vi snabbt återkomma med ett passande
                upplägg.
              </p>
              <p>
                Vi tar även emot förfrågningar om företagsmiddagar, pressbesök och samarbeten. Vi
                ser alltid till att hitta en lösning som passar plats, tempo och budget.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <article className="rounded-[1.5rem] border border-border/70 bg-background/65 p-5">
                <Truck className="mb-3 h-5 w-5 text-primary" />
                <h3 className="text-xl tracking-tight">Catering</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Buffé, mindre uppläggningsfat eller sittande servering – vi anpassar efter
                  sammanhanget.
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-border/70 bg-background/65 p-5">
                <MapPin className="mb-3 h-5 w-5 text-primary" />
                <h3 className="text-xl tracking-tight">Läge</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Närmsta parkering finns på tvärgatan och hållplatsen ligger bara några minuter
                  bort.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Följ oss</p>
            <h2 className="max-w-3xl text-3xl tracking-tight sm:text-4xl">
              Se stämningen, råvarorna och kvällens serveringar i våra kanaler
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Instagram visar kvällens uttryck och Facebook är bra för nyheter, öppettider och
              kommande event. Ikonerna kompletteras med textlänkar för tydlighet och tillgänglighet.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            {socialLinks.map((link) => {
              const Icon = link.label === "Instagram" ? Instagram : Facebook;

              return (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="surface-panel flex min-w-60 items-center gap-4 px-5 py-4 transition-all duration-300 motion-safe:hover:-translate-y-1"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span>
                    <span className="block text-lg tracking-tight text-foreground">{link.label}</span>
                    <span className="text-sm text-muted-foreground">{link.handle}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}