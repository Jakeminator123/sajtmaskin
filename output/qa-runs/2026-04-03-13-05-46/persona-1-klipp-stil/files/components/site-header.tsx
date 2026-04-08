"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu, Scissors } from "lucide-react";

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
import { navigation } from "@/lib/site";

function isItemActive(pathname: string, href: string, activeMatch: "exact" | "never" | "startsWith") {
  if (activeMatch === "never") {
    return false;
  }

  if (activeMatch === "startsWith") {
    return pathname.startsWith(href);
  }

  return pathname === href;
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between rounded-[1.75rem] border border-border/70 bg-background/88 px-4 py-3 shadow-[0_18px_40px_-28px_rgba(43,42,40,0.3)] backdrop-blur-xl sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-full transition-colors hover:text-accent"
            aria-label="Gå till startsidan för Klipp & Stil"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/35 text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">Klipp & Stil</p>
              <p className="text-xs text-muted-foreground sm:text-sm">Frisörsalong i Göteborg</p>
            </div>
          </Link>

          <nav aria-label="Huvudnavigation" className="hidden items-center gap-2 lg:flex">
            {navigation.map((item) => {
              const active = isItemActive(pathname, item.href, item.activeMatch);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-muted hover:text-foreground",
                    active && "bg-primary text-primary-foreground shadow-sm",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden lg:block">
            <Button asChild size="lg" className="rounded-full px-6 transition-all duration-200 active:scale-95">
              <Link href="/boka">Boka tid</Link>
            </Button>
          </div>

          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full bg-background/80"
                  aria-label="Öppna meny"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[90vw] max-w-sm bg-background">
                <SheetHeader className="text-left">
                  <SheetTitle>Meny</SheetTitle>
                  <SheetDescription>Välj sida eller gå direkt till bokningen.</SheetDescription>
                </SheetHeader>

                <div className="mt-8 space-y-2">
                  {navigation.map((item) => {
                    const active = isItemActive(pathname, item.href, item.activeMatch);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-2xl border border-border/70 px-4 py-3 text-base font-medium transition-all duration-200 hover:border-accent/30 hover:bg-muted",
                          active && "border-primary bg-primary text-primary-foreground",
                        )}
                      >
                        <span className="block">{item.label}</span>
                        <span
                          className={cn(
                            "mt-1 block text-sm text-muted-foreground",
                            active && "text-primary-foreground/80",
                          )}
                        >
                          {item.description}
                        </span>
                      </Link>
                    );
                  })}
                </div>

                <Button asChild size="lg" className="mt-8 w-full rounded-full transition-all duration-200 active:scale-95">
                  <Link href="/boka">Boka tid</Link>
                </Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
