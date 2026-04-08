"use client";



import { useState } from "react";
import { Menu, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";


import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { primaryNav, siteConfig } from "@/lib/site-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button"

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Gå till startsidan"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight sm:text-base">
              {siteConfig.name}
            </span>
            <span className="text-xs text-muted-foreground">
              Teknikpartner för företag
            </span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Huvudnavigering"
        >
          {primaryNav.map((item) => {
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <Button asChild className="active:scale-95 transition-all duration-200">
            <Link href="/kontakt">Boka tid</Link>
          </Button>
        </div>

        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Öppna meny"
                className="active:scale-95 transition-all duration-200"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent
              side="right"
              className="w-[320px] border-l border-border bg-background"
            >
              <SheetHeader className="text-left">
                <SheetTitle>Meny</SheetTitle>
                <SheetDescription>
                  Navigera mellan sidorna eller boka ett första möte med vårt
                  team.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-8 flex flex-col gap-2">
                {primaryNav.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-xl px-4 py-3 text-base font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-8 space-y-4 rounded-[1.25rem] border border-border bg-muted/60 p-4">
                <div>
                  <p className="text-sm font-semibold">Direktkontakt</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Ring oss på {siteConfig.phone} eller skicka ett mejl så
                    återkommer vi snabbt.
                  </p>
                </div>

                <Button
                  asChild
                  className="w-full active:scale-95 transition-all duration-200"
                >
                  <Link href="/kontakt" onClick={() => setOpen(false)}>
                    Kontakta oss
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
