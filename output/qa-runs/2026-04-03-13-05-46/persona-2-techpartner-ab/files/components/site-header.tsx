"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navigation, siteConfig } from "@/lib/site-data";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => {
      setHash(window.location.hash);
    };

    updateHash();
    window.addEventListener("hashchange", updateHash);

    return () => {
      window.removeEventListener("hashchange", updateHash);
    };
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" && hash !== "#tjanster";
    }

    if (href === "/#tjanster") {
      return pathname === "/" && hash === "#tjanster";
    }

    return pathname === href;
  };

  const brandMark = (
    <div className="grid h-9 w-9 grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-card p-1 shadow-sm">
      <span className="rounded-lg bg-primary/90" />
      <span className="rounded-lg bg-accent" />
      <span className="rounded-lg bg-secondary" />
      <span className="rounded-lg bg-foreground/85" />
    </div>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/92 backdrop-blur-xl">
      <div className="section-shell flex h-18 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {brandMark}
          <div className="flex flex-col">
            <span className="font-display text-base font-semibold tracking-tight text-foreground">
              {siteConfig.name}
            </span>
            <span className="text-sm text-muted-foreground">
              Systemutveckling, moln och säkerhet
            </span>
          </div>
        </Link>

        <nav aria-label="Huvudnavigering" className="hidden items-center gap-2 lg:flex">
          {navigation.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild size="sm" className="rounded-full">
            <Link href="/kontakt">
              Boka tid
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Öppna meny"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px] border-l border-border/70 bg-background px-6">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-xl">Meny</SheetTitle>
              <SheetDescription className="sr-only">
                Navigera mellan sidorna på TechPartner AB:s webbplats.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-8 flex items-center gap-3">
              {brandMark}
              <div>
                <p className="font-display text-base font-semibold text-foreground">
                  {siteConfig.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  För företag i Stockholm
                </p>
              </div>
            </div>

            <nav aria-label="Mobilnavigering" className="mt-8 flex flex-col gap-2">
              {navigation.map((item) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/30 bg-secondary text-foreground"
                        : "border-border/70 bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 rounded-[1.75rem] border border-border/70 bg-secondary p-5">
              <p className="font-display text-lg font-semibold text-foreground">
                Behöver du en trygg teknikpartner?
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Vi hjälper CTO:er och IT-chefer att få fart, struktur och säkerhet i nästa steg.
              </p>
              <Button asChild className="mt-5 w-full rounded-full">
                <Link href="/kontakt" onClick={() => setOpen(false)}>
                  Kontakta oss
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

export default SiteHeader;
