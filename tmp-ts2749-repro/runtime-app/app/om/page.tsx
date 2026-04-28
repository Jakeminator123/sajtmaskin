import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function OmPage() {
  return (
    <main className="min-h-[70vh] bg-[oklch(0.58_0.22_262)] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col justify-center px-6 py-20">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Badge className="w-fit border border-white/20 bg-white/10 text-white hover:bg-white/10">
            Förberedd sida
          </Badge>
          <div className="space-y-3">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Om
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
              Den här sidan finns medvetet redan nu så att navigation, preview och strukturen i projektet håller ihop medan huvudsidan får mest kvalitet i första byggsteget.
            </p>
          </div>
          <div className="space-y-3 text-sm text-white/75">
            <p>Path: /om</p>
            <p>Preserve the existing Om route unless the user explicitly asks to remove it.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-[oklch(0.58_0.22_262)] hover:bg-white/90"
            >
              <Link href="/om">
                Skapa sida <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/">
                Till huvudsidan
              </Link>
            </Button>
          </div>
        </div>
        <Card className="border-white/15 bg-white/8 text-white shadow-none">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-sm font-medium">Plan för sidan</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Preserve the existing Om route unless the user explicitly asks to remove it.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Varför sidan är enkel just nu</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Första generationen fokuserar på att göra huvudsidan stark. Den här sidan finns redan som en giltig route, men är avsiktligt lätt tills du väljer att bygga ut just den.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">Nästa steg</p>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Öppna sidan via navigationen och be sedan buildern att bygga ut om fullt ut.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </main>
  );
}
