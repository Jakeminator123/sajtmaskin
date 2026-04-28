"use client";
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { useState } from "react";

import { usePathname } from "next/navigation";
import { Flame, Gamepad as Gamepad2, Menu } from "lucide-react";



import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigation = [
  { href: "/", label: "Om oss" },
  { href: "/spel", label: "Hamburgerspel" },
  { href: "/om", label: "Bakom grillen" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="section-shell flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full transition-opacity duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Flame className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg leading-none tracking-tight text-foreground">
              Glöd Burger Club
            </p>
            <p className="text-xs text-muted-foreground">Burger • Arcade • Vibes</p>
          </div>
        </Link>

        <nav
          aria-label="Huvudnavigation"
          className="hidden items-center gap-2 md:flex"
        >
          {navigation.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Badge
            variant="outline"
            className="rounded-full border-secondary/60 bg-secondary/60 px-3 py-1 text-secondary-foreground"
          >
            Öppet sent fre–lör
          </Badge>
          <Button asChild className="rounded-full px-5 active:scale-95">
            <Link href="/spel">
              <Gamepad2 className="mr-2 h-4 w-4" />
              Spela nu
            </Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full active:scale-95"
              aria-label="Öppna meny"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[88vw] max-w-sm px-6">
            <div className="space-y-6 pt-6">
              <div className="space-y-2">
                <SheetTitle className="font-display text-2xl tracking-tight">
                  Glöd Burger Club
                </SheetTitle>
                <SheetDescription className="text-sm leading-relaxed text-muted-foreground">
                  Hitta till restaurangen, spelet och vår historia i ett par
                  snabba klick.
                </SheetDescription>
              </div>

              <div className="space-y-2">
                {navigation.map((item) => {
                  const active = pathname === item.href;

                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-base font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-card text-foreground hover:border-primary/20 hover:bg-muted"
                        }`}
                      >
                        <span>{item.label}</span>
                        {item.href === "/spel" ? (
                          <Gamepad2 className="h-4 w-4" />
                        ) : (
                          <Flame className="h-4 w-4" />
                        )}
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>

              <div className="rounded-[1.5rem] border border-border bg-card/80 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Besökstips
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Börja på Om oss om du vill se maten och hitta öppettider.
                  Hoppa direkt till spelet om du vill köra en snabb burger-runda.
                </p>
              </div>

              <SheetClose asChild>
                <Button asChild className="w-full rounded-full active:scale-95">
                  <Link href="/spel">
                    <Gamepad2 className="mr-2 h-4 w-4" />
                    Till hamburgerspelet
                  </Link>
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

export default SiteHeader;
