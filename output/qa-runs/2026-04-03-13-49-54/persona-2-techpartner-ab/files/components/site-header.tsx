"use client";
import { cn } from "@/lib/utils";

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
import { navigation, siteConfig } from "@/lib/site-data";


function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="TechPartner AB, gå till startsidan"
        >
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/25">
            <span className="absolute inset-[7px] rounded-xl border border-primary/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <span className="flex flex-col">
            <span className="text-base font-semibold tracking-tight">
              {siteConfig.name}
            </span>
            <span className="text-xs text-muted-foreground">
              Systemutveckling • Moln • Säkerhet
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
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-muted hover:text-foreground",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Button
            asChild
            className="rounded-full px-5 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
          >
            <Link href="/kontakt">Boka tid</Link>
          </Button>
        </div>

        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                aria-label="Öppna meny"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[320px] border-l border-border/80 bg-background/95 px-6">
              <SheetHeader className="mt-6 text-left">
                <SheetTitle>{siteConfig.name}</SheetTitle>
                <SheetDescription>
                  Tjänster för systemutveckling, moln och säkerhet med tydlig
                  riktning från start.
                </SheetDescription>
              </SheetHeader>

              <nav
                className="mt-10 flex flex-col gap-2"
                aria-label="Mobil navigation"
              >
                {navigation.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 hover:border-primary/20 hover:bg-muted",
                        active
                          ? "border-primary/20 bg-primary/5 text-primary"
                          : "border-border/70 text-foreground",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-8 space-y-3">
                <Button
                  asChild
                  className="w-full rounded-full transition-all duration-200 active:scale-95"
                >
                  <Link href="/kontakt">Boka tid</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-full transition-all duration-200 active:scale-95"
                >
                  <Link href="/priser">Se priser</Link>
                </Button>
              </div>

              <div className="mt-8 rounded-3xl border border-border/80 bg-muted/60 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Vanligtvis svar inom en arbetsdag
                </p>
                <p className="mt-2 leading-relaxed">
                  Beskriv ert nuläge kort så återkommer vi med ett tydligt nästa
                  steg och ett förslag på upplägg.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
