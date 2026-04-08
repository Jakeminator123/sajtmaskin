
import type { Metadata } from "next";
import Image from "next/image";
import { CalendarDays, CheckCircle2, MessageSquareMore, PhoneCall } from "lucide-react";

import { BookingForm } from "@/components/booking-form";
import SectionHeading from "@/components/section-heading";

import { createMetadata, openingHours, siteConfig } from "@/lib/site-data";

export const metadata: Metadata = createMetadata({
  title: "Boka tid",
  description:
    "Boka bord online hos Sjöstaden Bistro. Skicka önskat datum och tid så återkommer vi snabbt med bekräftelse och hjälp för större sällskap.",
  path: "/boka",
});

const bookingSteps = [
  {
    title: "Välj datum och tid",
    description:
      "Skicka in det som passar dig bäst. Vi använder din förfrågan som grund för att planera kvällens flöde.",
    icon: CalendarDays,
  },
  {
    title: "Skriv särskilda önskemål",
    description:
      "Berätta om allergier, barnvagn, firande eller sällskapets storlek så förbereder vi rätt upplägg.",
    icon: MessageSquareMore,
  },
  {
    title: "Få din bekräftelse",
    description:
      "Vi återkommer via e-post eller telefon så snart vi har reserverat ditt bord och gått igenom detaljerna.",
    icon: CheckCircle2,
  },
];

export default function BookingPage() {
  return (
    <div className="overflow-x-hidden">
      <section className="border-b border-border/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.32em] text-primary/80">Boka bord online</p>
            <h1 className="max-w-3xl text-5xl tracking-tight sm:text-6xl">
              Skicka din bokning så återkommer vi med bekräftelse
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Boka din tid här så återkommer vi med bekräftelse. För större sällskap eller särskilda
              önskemål – skriv en rad i meddelandet så ordnar vi resten. Välkommen!
            </p>
          </div>

          <div className="surface-panel overflow-hidden p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
              <Image
                src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=900&fit=crop&q=80"
                alt="Intim bistrointeriör med dukat bord, levande ljus och varm kvällsstämning"
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Så fungerar bokningen"
            title="Snabb process, tydlig återkoppling och plats för detaljer"
            description="Vi vill att det ska vara enkelt att boka, men också tryggt att lämna information som gör kvällen bättre. Därför är formuläret kort och bekräftelsen personlig."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {bookingSteps.map((step) => (
              <article key={step.title} className="surface-panel brass-line p-6 pt-8">
                <step.icon className="mb-4 h-5 w-5 text-primary" />
                <h2 className="text-2xl tracking-tight">{step.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/35 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="space-y-6">
            <SectionHeading
              eyebrow="Bokningsformulär"
              title="Berätta när du vill komma – vi tar hand om resten"
              description="Använd formuläret för att boka lunch, middag eller skicka en förfrågan om större sällskap. Ju mer du berättar om tillfället, desto bättre kan vi förbereda ditt besök."
            />
            <BookingForm />
          </div>

          <aside className="space-y-6">
            <div className="surface-panel overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-primary/15">
                <Image
                  src="https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=900&fit=crop&q=80"
                  alt="Servis och dukning i mörk lyxig bistromiljö med varma metaller"
                  fill
                  className="object-cover"
                />
              </div>
            </div>

            <div className="surface-panel p-6">
              <h2 className="text-2xl tracking-tight">Inför ditt besök</h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Vi har öppet måndag till fredag 11:00–22:00 och lördag till söndag 12:00–23:00.
                  För större sällskap rekommenderar vi att du skickar bokningen i god tid så att vi
                  kan reservera rätt bord och ge förslag på upplägg.
                </p>
                <p>
                  Har du behov av barnstol, plats för barnvagn eller vill överraska någon med ett
                  firande? Skriv gärna det i meddelandet så förbereder vi detaljerna innan ni
                  kommer.
                </p>
              </div>
              <div className="mt-6 grid gap-4">
                {openingHours.map((slot) => (
                  <div
                    key={slot.label}
                    className="rounded-2xl border border-border/70 bg-background/65 p-4"
                  >
                    <h3 className="text-lg tracking-tight">{slot.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{slot.hours}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          <article className="surface-panel p-6">
            <PhoneCall className="mb-4 h-5 w-5 text-primary" />
            <h2 className="text-2xl tracking-tight">Behöver du hjälp direkt?</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              För bokningar samma dag eller om något är brådskande svarar vi snabbast på telefon.
            </p>
            <a
              href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
              className="mt-4 block text-sm text-foreground transition-colors hover:text-primary"
            >
              {siteConfig.phone}
            </a>
          </article>

          <article className="surface-panel p-6">
            <MessageSquareMore className="mb-4 h-5 w-5 text-primary" />
            <h2 className="text-2xl tracking-tight">Catering och större sällskap</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              För catering och större sällskap rekommenderar vi att du kontaktar oss så
              skräddarsyr vi upplägget efter antal, plats och serveringsform.
            </p>
            <a
              href={`mailto:${siteConfig.email}`}
              className="mt-4 block text-sm text-foreground transition-colors hover:text-primary"
            >
              {siteConfig.email}
            </a>
          </article>

          <article className="surface-panel p-6">
            <CalendarDays className="mb-4 h-5 w-5 text-primary" />
            <h2 className="text-2xl tracking-tight">Besöksadress</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Vi finns på {siteConfig.fullAddress}. Läget passar både spontana middagar och planerade
              kvällar med kollegor eller vänner.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}