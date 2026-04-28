"use client";
import { Button } from "@/components/ui/button"
import Link from "next/link"


import { Clock3, MapPin, Phone } from "lucide-react";


import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function VisitDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full border-border/70 bg-background/80 px-5 active:scale-95"
        >
          Öppettider & karta
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[1.75rem] border-border/80 sm:max-w-xl">
        <DialogTitle className="font-display text-3xl tracking-tight">
          Planera ditt besök
        </DialogTitle>
        <DialogDescription className="text-base leading-relaxed text-muted-foreground">
          Vi finns på Kungsholmen i Stockholm, med sittplatser, takeaway och
          kvällsöppet fredag–lördag.
        </DialogDescription>

        <div className="grid gap-4 py-4 sm:grid-cols-3">
          <div className="rounded-[1.25rem] border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Adress
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              S:t Eriksgatan 45
              <br />
              112 34 Stockholm
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              Öppettider
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Mån–tors 11–21
              <br />
              Fre–lör 11–23
              <br />
              Sön 12–20
            </p>
          </div>
          <div className="rounded-[1.25rem] border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Phone className="h-4 w-4 text-primary" />
              Kontakt
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              08-123 45 678
              <br />
              hej@glodburgerclub.se
            </p>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-primary/15 bg-primary/10 p-4">
          <p className="text-sm font-medium text-foreground">
            Snabbaste sättet hit:
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Fem minuter från Fridhemsplan. Perfekt för en spontan burgarkväll
            eller takeaway på vägen hem.
          </p>
        </div>

        <DialogFooter className="mt-2 flex-col gap-3 sm:flex-row">
          <DialogClose asChild>
            <Button
              variant="ghost"
              className="rounded-full px-6 active:scale-95"
            >
              Stäng
            </Button>
          </DialogClose>
          <Button asChild className="rounded-full px-6 active:scale-95">
            <Link
              href="https://maps.google.com/?q=S:t+Eriksgatan+45+Stockholm"
              target="_blank"
              rel="noreferrer"
            >
              Öppna i kartor
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}