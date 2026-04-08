"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

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
import { navigation, openingHours, siteConfig } from "@/lib/site-data";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const hoursSummary = openingHours
    .map((slot) => `${slot.label} ${slot.hours}`)
    .join(" • ");

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="Gå till startsidan">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/35 bg-primary/10 text-sm font-semibold text-primary transition-transform duration-300 motion-safe:group-hover:scale-105">
            SB
          </span>
          <span className="flex flex-col">
            <span className="font-display text-lg leading-none tracking-tight text-foreground">
              {siteConfig.name}
            </span>
            <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Malmö • Bistro • Catering
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex" aria-label="Huvudnavigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(item.href)
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {siteConfig.phone}
          </a>
          <Button asChild className="rounded-full px-6 active:scale-95">
            <Link href="/boka">Boka tid</Link>
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button
              variant="outline"
              size="icon"
              aria-label="Öppna meny"
              className="rounded-full border-primary/20 bg-card/80"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="border-l border-border/70 bg-card px-6">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-2xl tracking-tight">
                {siteConfig.name}
              </SheetTitle>
              <SheetDescription>
                Utforska menyn, boka bord eller kontakta oss för catering och större sällskap.
              </SheetDescription>
            </SheetHeader>

            <nav className="mt-10 flex flex-col gap-3" aria-label="Mobilnavigation">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "rounded-2xl border px-4 py-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive(item.href)
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-background/60 text-foreground hover:border-primary/25 hover:bg-background",
                  )}
                >
                  <span className="block text-base font-medium">{item.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>
                </Link>
              ))}
            </nav>

            <div className="mt-8 space-y-4 rounded-3xl border border-primary/15 bg-background/70 p-5">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Öppet {hoursSummary}. För catering och större bokningar hjälper vi dig gärna direkt.
              </p>
              <div className="space-y-2 text-sm">
                <a
                  href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
                  className="block transition-colors hover:text-primary"
                >
                  {siteConfig.phone}
                </a>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="block transition-colors hover:text-primary"
                >
                  {siteConfig.email}
                </a>
              </div>
              <Button asChild className="w-full rounded-full active:scale-95">
                <Link href="/boka" onClick={() => setOpen(false)}>
                  Boka tid
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