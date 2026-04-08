"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Gem, Menu } from "lucide-react";

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
import { navigation } from "@/lib/site-data";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="section-shell flex h-20 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Silverträdet, gå till startsidan"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card shadow-sm">
            <Gem className="h-5 w-5 text-primary" />
          </span>
          <span className="flex flex-col">
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              Silverträdet
            </span>
            <span className="text-xs text-muted-foreground">
              Handgjort i Göteborg
            </span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Huvudnavigation"
        >
          {navigation.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/galleri">
              Handla smycken
              <ArrowRight className="h-4 w-4" />
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
          <SheetContent side="right" className="w-[88vw] max-w-sm border-border/70">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display text-2xl tracking-tight">
                Silverträdet
              </SheetTitle>
              <SheetDescription>
                Utforska handgjorda silversmycken, priser, galleri och kontakt.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-8 flex flex-col gap-2">
              {navigation.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-2xl border px-4 py-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>

            <div className="mt-6">
              <Button asChild size="lg" className="w-full rounded-full">
                <Link href="/galleri" onClick={() => setOpen(false)}>
                  Handla smycken
                  <ArrowRight className="h-4 w-4" />
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
