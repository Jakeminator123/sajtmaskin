import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, BadgeCheck, Clock3, Handshake, Sparkles } from "lucide-react";

const offers = [
  {
    title: "[Erbjudande 1]",
    description: "[Beskriv det viktigaste erbjudandet eller styrkan — anpassa till verksamheten.]",
    icon: Sparkles,
  },
  {
    title: "[Erbjudande 2]",
    description: "[Beskriv en annan styrka, tjänst eller unik fördel som besökaren bryr sig om.]",
    icon: BadgeCheck,
  },
  {
    title: "[Erbjudande 3]",
    description: "[Beskriv en tredje aspekt — öppettider, läge, kvalitet, erfarenhet eller liknande.]",
    icon: Clock3,
  },
];

export default function HomePage() {
  return (
    <div className="pb-8">
      <section className="px-6 py-20 sm:px-8 sm:py-24 lg:py-32">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-8">
            <Badge className="rounded-full px-3 py-1 text-sm">[Kort slagord]</Badge>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
                [Huvudrubrik som speglar verksamheten]
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
                [Kort ingress som beskriver vad företaget erbjuder och varför besökaren ska stanna.]
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                [Primär CTA] <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                [Sekundär CTA]
              </Button>
            </div>
            <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 1]</p>
                <p>[Kort förklaring]</p>
              </div>
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 2]</p>
                <p>[Kort förklaring]</p>
              </div>
              <div className="rounded-2xl border bg-card/70 p-4">
                <p className="text-2xl font-semibold text-foreground">[Nyckeltal 3]</p>
                <p>[Kort förklaring]</p>
              </div>
            </div>
          </div>

          <Card className="overflow-hidden border-primary/15 bg-card/90 shadow-xl shadow-primary/10">
            <CardHeader className="space-y-5 p-7">
              <Badge variant="secondary" className="w-fit rounded-full">[Etikett]</Badge>
              <div className="space-y-3">
                <CardTitle className="text-2xl">[Sidopanelens rubrik]</CardTitle>
                <p className="text-sm leading-7 text-muted-foreground">
                  [Kort sammanfattning av vad verksamheten erbjuder eller varför kunden ska välja just dem.]
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-7 pt-0">
              {["[Fördel 1]", "[Fördel 2]", "[Fördel 3]"].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-secondary/70 p-4">
                  <Handshake className="mt-0.5 h-5 w-5 text-primary" />
                  <p className="text-sm leading-6">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="px-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 rounded-4xl border bg-card/70 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">[Förtroendesignal]</p>
          <div className="flex flex-wrap gap-4 text-sm text-foreground/80">
            <span>[Kategori 1]</span>
            <span>[Kategori 2]</span>
            <span>[Kategori 3]</span>
            <span>[Kategori 4]</span>
          </div>
        </div>
      </section>

      <section id="erbjudande" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="max-w-2xl space-y-3">
            <Badge variant="secondary" className="rounded-full">[Sektionsetikett]</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">[Rubrik för erbjudandesektion]</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv kort vad verksamheten erbjuder eller vad som gör den unik.]
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {offers.map((offer) => (
              <Card key={offer.title} className="rounded-[1.6rem] border bg-card/85 shadow-sm">
                <CardHeader className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <offer.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl">{offer.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">{offer.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="om" className="bg-card/50 px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full">[Sektionsetikett]</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">[Rubrik om verksamheten eller processen]</h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv hur företaget arbetar, varför kunden kan lita på dem, eller ge bakgrund.]
            </p>
          </div>
          <div className="space-y-5">
            {["[Punkt 1 — t.ex. kvalitet, erfarenhet eller unikhet]", "[Punkt 2 — t.ex. process eller leverans]", "[Punkt 3 — t.ex. garanti eller kundlöfte]"].map((step, index) => (
              <div key={step} className="rounded-[1.6rem] border bg-background/80 p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <p className="font-medium">{step}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="kontakt" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-4xl border bg-linear-to-br from-primary/10 via-background to-accent/40 p-8 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="rounded-full px-3 py-1">[Social proof]</Badge>
              <p className="text-2xl font-semibold leading-10 tracking-tight sm:text-3xl">
                “[Kundcitat eller kort rekommendation som speglar verksamheten.]”
              </p>
              <Separator className="max-w-32" />
              <div>
                <p className="font-medium">[Kundens namn]</p>
                <p className="text-sm text-muted-foreground">[Roll eller relation]</p>
              </div>
            </div>
            <div className="rounded-[1.6rem] bg-background/85 p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">[Kontakt]</p>
              <h3 className="mt-2 text-2xl font-semibold">[CTA-rubrik]</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                [Kort text som uppmanar besökaren att ta nästa steg.]
              </p>
              <Button className="mt-6 w-full rounded-full" size="lg">
                [CTA-knapptext] <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
