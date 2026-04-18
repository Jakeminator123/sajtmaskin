import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  Handshake,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

const services = [
  { title: "[Tjänst 1]", description: "[1–2 meningar: vad ingår, för vem, resultatet.]", icon: Scale },
  { title: "[Tjänst 2]", description: "[1–2 meningar: vad ingår, för vem, resultatet.]", icon: ClipboardCheck },
  { title: "[Tjänst 3]", description: "[1–2 meningar: vad ingår, för vem, resultatet.]", icon: Handshake },
  { title: "[Tjänst 4]", description: "[1–2 meningar: vad ingår, för vem, resultatet.]", icon: Sparkles },
];

const processSteps = [
  { title: "1. [Första kontakt]", description: "[Hur kunden tar kontakt och hur snabbt ni återkopplar.]" },
  { title: "2. [Behovsanalys]", description: "[Hur ni kartlägger situation, mål och förutsättningar.]" },
  { title: "3. [Förslag och offert]", description: "[Tydligt upplägg, tidplan och pris — utan överraskningar.]" },
  { title: "4. [Leverans och uppföljning]", description: "[Själva leveransen samt hur ni följer upp resultatet.]" },
];

const packages = [
  {
    name: "[Paket Start]",
    price: "[Från X kr/mån]",
    description: "[Vem paketet passar och kort om vad som ingår.]",
    bullets: ["[Inkluderat 1]", "[Inkluderat 2]", "[Inkluderat 3]"],
    featured: false,
  },
  {
    name: "[Paket Standard]",
    price: "[Från Y kr/mån]",
    description: "[Vem paketet passar och kort om vad som ingår.]",
    bullets: ["[Inkluderat 1]", "[Inkluderat 2]", "[Inkluderat 3]", "[Inkluderat 4]"],
    featured: true,
  },
  {
    name: "[Paket Full]",
    price: "[Från Z kr/mån]",
    description: "[Vem paketet passar och kort om vad som ingår.]",
    bullets: ["[Inkluderat 1]", "[Inkluderat 2]", "[Inkluderat 3]", "[Inkluderat 4]", "[Inkluderat 5]"],
    featured: false,
  },
];

const trustSignals = [
  { label: "[X år]", caption: "i branschen" },
  { label: "[Y+]", caption: "nöjda kunder" },
  { label: "[Auktoriserad]", caption: "[av organ]" },
  { label: "[4,9/5]", caption: "i kundomdömen" },
];

export default function HomePage() {
  return (
    <div className="pb-10">
      <section className="px-6 py-20 sm:px-8 sm:py-24 lg:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl space-y-7">
            <Badge variant="secondary" className="w-fit rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]">
              [Bransch] · [Ort]
            </Badge>
            <div className="space-y-5">
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                [Rubrik som säger vad ni gör och för vem — t.ex. &quot;Advokatbyrå för arbetsrätt i Stockholm&quot;]
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                [Ingress om expertis, målgrupp och varför kunden ska välja er. Nämn specialisering, geografi och erfarenhet.]
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7">
                Boka kostnadsfritt möte <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-7">
                Ring oss direkt
              </Button>
            </div>
          </div>

          <div className="mt-12 grid gap-5 rounded-3xl border bg-card/70 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {trustSignals.map((s) => (
              <div key={s.caption} className="flex items-baseline gap-3">
                <p className="text-2xl font-semibold tracking-tight">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.caption}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tjanster" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="sm:max-w-3xl space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full">Tjänster</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              [Rubrik som sammanfattar tjänsterna]
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Ingress om er metod, specialisering eller värdegrund.]
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <Card key={s.title} className="rounded-2xl border bg-card shadow-sm">
                <CardHeader className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-lg leading-snug">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-7 text-muted-foreground">{s.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="bg-secondary/30 px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <Badge variant="secondary" className="rounded-full">Så arbetar vi</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              [Rubrik om processen — &quot;Från första samtal till leverans&quot;]
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv er process: tydliga steg, transparenta priser, personlig kontakt.]
            </p>
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <span>[Kort kundlöfte eller garanti]</span>
            </div>
          </div>
          <ol className="space-y-4">
            {processSteps.map((step) => (
              <li key={step.title} className="rounded-2xl border bg-card p-5">
                <p className="font-semibold tracking-tight">{step.title}</p>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="priser" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <div className="sm:max-w-3xl space-y-3">
            <Badge variant="secondary" className="w-fit rounded-full">Priser</Badge>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              [Rubrik om paket — &quot;Paket som växer med ditt behov&quot;]
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Kort text om prissättning. Transparent är bäst — använd &quot;från X kr&quot; om exakt pris saknas.]
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {packages.map((pkg) => (
              <Card
                key={pkg.name}
                className={
                  pkg.featured
                    ? "rounded-2xl border-primary/30 bg-card shadow-md ring-1 ring-primary/20"
                    : "rounded-2xl border bg-card shadow-sm"
                }
              >
                <CardHeader className="space-y-2">
                  {pkg.featured ? <Badge className="w-fit rounded-full">Populärast</Badge> : null}
                  <CardTitle className="text-xl">{pkg.name}</CardTitle>
                  <p className="text-2xl font-semibold tracking-tight">{pkg.price}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{pkg.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Separator />
                  <ul className="space-y-2 text-sm">
                    {pkg.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Button variant={pkg.featured ? "default" : "outline"} className="mt-4 w-full rounded-full">
                    Välj paket
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="om" className="bg-secondary/30 px-6 py-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <Badge variant="secondary" className="w-fit rounded-full">Om oss</Badge>
            <h2 className="text-3xl font-semibold tracking-tight">
              [Rubrik som speglar er identitet]
            </h2>
            <p className="text-lg leading-8 text-muted-foreground">
              [Beskriv teamet: antal anställda, erfarenhet, specialiseringar, auktorisationer.]
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Team</span>
                </div>
                <p className="mt-1 font-semibold">[X specialister]</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Auktorisation</span>
                </div>
                <p className="mt-1 font-semibold">[Namn på organ]</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  <span>Sedan</span>
                </div>
                <p className="mt-1 font-semibold">[År]</p>
              </div>
            </div>
          </div>

          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full">Kundomdöme</Badge>
              <CardTitle className="text-lg leading-snug">
                &ldquo;[Kundcitat — konkret, resultatfokuserat.]&rdquo;
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Separator className="max-w-24" />
              <p className="font-medium">[Kundens namn]</p>
              <p className="text-sm text-muted-foreground">[Roll, företag]</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="kontakt" className="px-6 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl rounded-3xl border bg-card p-8 shadow-sm sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <Badge variant="secondary" className="w-fit rounded-full">Kontakt</Badge>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                [CTA-rubrik — &quot;Boka ett kostnadsfritt möte&quot;]
              </h2>
              <p className="text-lg leading-8 text-muted-foreground">
                [Text som uppmanar besökaren att ta nästa steg — responstid, kostnadsfri första kontakt.]
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="rounded-full px-7">
                  Boka möte <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="rounded-full px-7">
                  Skicka förfrågan
                </Button>
              </div>
            </div>
            <div className="space-y-3 rounded-2xl bg-secondary/60 p-5 text-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Direktkontakt</p>
              <p className="font-semibold">[+46 8 000 00 00]</p>
              <p>[info@företag.se]</p>
              <Separator />
              <p className="text-muted-foreground">[Gatuadress, Postnummer Ort]</p>
              <p className="text-muted-foreground">Mån–Fre [08–17]</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
