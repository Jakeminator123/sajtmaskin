import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle, Star } from "lucide-react";
import Image from "next/image";

const features = [
  {
    title: "Responsiv design",
    description: "Varje webbplats vi bygger fungerar perfekt på mobil, surfplatta och desktop.",
    icon: CheckCircle,
  },
  {
    title: "Snabb laddning",
    description: "Optimerade sidor som laddar blixtsnabbt med Next.js och edge-rendering.",
    icon: CheckCircle,
  },
  {
    title: "SEO-optimerat",
    description: "Inbyggd sökmotoroptimering så att dina kunder hittar dig på Google.",
    icon: CheckCircle,
  },
];

const testimonials = [
  {
    name: "[Kundens namn]",
    role: "[Roll], [Företag]",
    quote: "Teamet levererade en webbplats som överträffade våra förväntningar. Proffsigt, snabbt och tydligt.",
    rating: 5,
  },
  {
    name: "[Kundens namn]",
    role: "[Roll], [Företag]",
    quote: "Fantastisk process från start till mål. Vår nya sajt har ökat konverteringen med 40%.",
    rating: 5,
  },
  {
    name: "[Kundens namn]",
    role: "[Roll], [Företag]",
    quote: "Äntligen en byrå som förstår både design och teknik. Starkt rekommenderad.",
    rating: 5,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center gap-6 px-6 py-32 text-center">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&q=80"
            alt="Team samarbetar vid dator"
            fill
            className="object-cover opacity-15"
            priority
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          Digital studio
        </Badge>
        <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
          Vi bygger webbplatser som driver resultat
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Modern design, snabb teknik och strategiskt tänkande — allt för att hjälpa ditt företag växa online.
        </p>
        <div className="flex gap-4 pt-4">
          <Button size="lg">
            Boka ett möte <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline">
            Se våra projekt
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Varför välja oss?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Vi kombinerar strategi, design och teknik för att leverera webbplatser som gör skillnad.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card border-border">
                <CardHeader>
                  <feature.icon className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-6 py-24 bg-secondary/30">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Vad våra kunder säger</h2>
            <p className="text-muted-foreground">Företag vi har hjälpt att lyckas online.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="bg-card border-border">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-card-foreground italic">"{t.quote}"</p>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">
            Redo att ta ditt företag till nästa nivå?
          </h2>
          <p className="text-muted-foreground">
            Kontakta oss idag för en kostnadsfri konsultation. Vi hjälper dig att hitta rätt lösning.
          </p>
          <Button size="lg">
            Kom igång <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
