"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="section-shell section-padding">
      <div className="surface-panel-strong rounded-[2rem] p-8 sm:p-12">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-primary/15 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <AlertTriangle className="h-4 w-4" />
            Något gick fel i köket
          </div>
          <div className="space-y-3">
            <h1 className="font-display text-4xl tracking-tight text-balance sm:text-5xl">
              Vi tappade brickan på vägen ut.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Sidan kunde inte laddas just nu. Testa igen eller gå tillbaka till
              startsidan för att fortsätta utforska Glöd Burger Club.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => reset()}
              className="rounded-full px-6 active:scale-95"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Försök igen
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full px-6 active:scale-95"
            >
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Till Om oss
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}