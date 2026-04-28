import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Flame, Gamepad2, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Om oss",
};

export default function Page() {
  return (
    <div className="overflow-x-clip">
      <section className="relative border-b border-border/60 pb-16 pt-14 sm:pb-20 sm:pt-20">
        <div className="pointer-events-none absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1800&q=80"
            alt=""
            aria-hidden="true"
            fill
            priority
            unoptimized
            sizes="100vw"
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 grid-lines opacity-70" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_35%,transparent)_0%,var(--background)_100%)]" />
        </div>

        <div className="section-shell relative">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-6">
              <Badge className="rounded-full bg-primary/10 px-4 py-1.5 text-primary hover:bg-primary/10">
                Glöd Burger Club • Om oss
              </Badge>
              <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Röd glöd, grön friskhet och turkos energi.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Vi är en modern hamburgerrestaurang i Stockholm där smashburgare,
                vegoalternativ och kvällsvibe möts i en stilren, lekfull miljö.
                Här får du snabb service, stark smakprofil och en upplevelse som
                känns lika bra på plats som online.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-7">
                  <a href="#kontakt">
                    Hitta hit
                    <MapPin className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-border/70 bg-background/80 px-7"
                >
                  <Link href="/spel">
                    Spela hamburgerspelet
                    <Gamepad2 className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="surface-panel-strong rounded-[2rem] border-border/80">
              <CardContent className="space-y-4 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <Flame className="h-5 w-5 text-primary" />
                  <p className="font-semibold text-foreground">Vår filosofi</p>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Vi tror på enkla råvaror med tydlig karaktär: saftig högrev,
                  krispiga gröna lager, färska tillbehör och bröd som håller
                  ihop hela upplevelsen.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Oavsett om du äter hos oss, tar takeaway eller testar vårt
                  spel, vill vi att känslan ska vara självsäker, varm och
                  minnesvärd.
                </p>
                <Button asChild variant="ghost" className="h-auto px-0 text-primary">
                  <Link href="/om">
                    Läs mer om oss
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="kontakt" className="section-padding">
        <div className="section-shell grid gap-4 sm:grid-cols-3">
          <div className="surface-panel rounded-[1.5rem] p-5">
            <p className="text-sm font-semibold text-foreground">Adress</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              S:t Eriksgatan 45, 112 34 Stockholm
            </p>
          </div>
          <div className="surface-panel rounded-[1.5rem] p-5">
            <p className="text-sm font-semibold text-foreground">Öppettider</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Mån–tors 11–21 • Fre–lör 11–23 • Sön 12–20
            </p>
          </div>
          <div className="surface-panel rounded-[1.5rem] p-5">
            <p className="text-sm font-semibold text-foreground">Nästa steg</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Utforska vår story på /om eller kör en snabb runda på /spel.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}