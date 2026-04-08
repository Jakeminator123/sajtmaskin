
import type { Metadata } from "next";

import { Check as CalendarCheck2, Clock3, Users } from "lucide-react";

import { BookingForm } from "@/components/booking-form";

import { bookingBenefits, siteConfig } from "@/lib/site-data";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Boka bord — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
  description:
    "Boka bord hos Sjöstaden Bistro i Malmö. Skicka din bokningsförfrågan för lunch, middag eller större sällskap och få snabb återkoppling från vår restaurang.",
  keywords: [
    "boka bord Malmö",
    "Sjöstaden Bistro bokning",
    "middag Malmö",
    "lunch Malmö bokning",
    "större sällskap restaurang",
  ],
  openGraph: {
    title:
      "Boka bord — Sjöstaden Bistro i Malmö serverar modern skandinavisk mat med lokala råvaror",
    description:
      "Skicka din bokningsförfrågan till Sjöstaden Bistro för lunch, middag eller större sällskap och få snabb återkoppling från restaurangen.",
  },
};

const steps = [
  {
    title: "Skicka önskat datum och tid",
    description:
      "Fyll i formuläret med kontaktuppgifter, önskat datum och tid samt eventuella önskemål för sällskapet.",
    icon: CalendarCheck2,
  },
  {
    title: "Vi återkommer snabbt",
    description:
      "Under öppettid svarar vi normalt inom två timmar via e-post eller telefon med bekräftelse eller förslag på alternativ tid.",
    icon: Clock3,
  },
  {
    title: "Ankomst och servering",
    description:
      "När du kommer möts du av en lugn matsal, personlig service och en meny som följer säsongens råvaror.",
    icon: Users,
  },
];

export default function BokaPage() {
  return (
    <div className="flex flex-col">
      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.28em] text-primary">
              Boka bord
            </p>
            <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Boka lunch, middag eller en kväll för större sällskap.
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Skicka en bokningsförfrågan så återkommer vi snabbt med bekräftelse.
              Vi tar emot allt från spontana lunchbokningar till middagar,
              födelsedagar och affärssällskap i vår mörka och eleganta matsal.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Har du allergier, särskilda önskemål eller planerar ett större
              sällskap är det bäst att skriva det direkt i formuläret. Då kan vi
              förbereda ett upplägg som känns genomtänkt redan från början.
            </p>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=760&width=900&text=Elegant+dukning+i+mörk+bistro+med+vinglas+levande+ljus+och+skandinavisk+middag"
              alt="Elegant dukning i mörk bistro med vinglas och levande ljus"
              width={900}
              height={760}
              priority
              className="h-[420px] w-full object-cover sm:h-[520px]"
            />
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">Så fungerar bokningen</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Vi vill att bokningsprocessen ska kännas enkel och personlig.
              Oavsett om du reserverar ett bord för två eller planerar ett större
              upplägg hjälper vi dig att hitta rätt nivå för besöket.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;

              return (
                <Card
                  key={step.title}
                  className="border-border/80 bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <CardContent className="p-6">
                    <div className="mb-5 inline-flex rounded-full bg-primary/10 p-3 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-2xl font-semibold">{step.title}</h3>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <BookingForm />

          <div className="space-y-6">
            <Card className="border-border/80 bg-card">
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold">Bra att veta</h2>
                <ul className="mt-5 space-y-4 text-sm leading-6 text-muted-foreground">
                  <li>Vi bekräftar alltid bokningen manuellt för att säkerställa att allt stämmer.</li>
                  <li>För större sällskap rekommenderar vi att du skickar din förfrågan minst några dagar i förväg.</li>
                  <li>Om du behöver avboka eller ändra tiden går det bra att ringa oss på {siteConfig.phone}.</li>
                </ul>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {bookingBenefits.map((item) => (
                <Card key={item.title} className="border-border/80 bg-card">
                  <CardContent className="p-5">
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-muted/25 py-16 sm:py-24 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
          <div className="overflow-hidden rounded-[2rem] border border-border/70">
            <Image
              src="/placeholder.svg?height=760&width=960&text=Mindre+sällskap+i+mörk+lyxig+bistro+med+vin+mat+och+varm+kvällskänsla"
              alt="Mindre sällskap som njuter av middag i mörk och lyxig bistro"
              width={960}
              height={760}
              className="h-[360px] w-full object-cover sm:h-[460px]"
            />
          </div>

          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">
              För större sällskap och catering
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              När du planerar en middag för fler gäster eller vill beställa
              catering hjälper vi dig gärna att skapa rätt känsla. Vi kan ta fram
              menyförslag, rekommendera dryck och anpassa upplägget efter om
              tillfället är formellt, festligt eller mer avslappnat.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              I meddelandefältet kan du ange om det gäller födelsedag,
              företagsmiddag, lansering eller leverans till annan plats i Malmö.
              Då återkommer vi med ett mer träffsäkert förslag redan i första svaret.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}