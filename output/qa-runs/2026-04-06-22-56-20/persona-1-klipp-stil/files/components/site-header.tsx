"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { useEffect, useState } from "react";

import { usePathname } from "next/navigation";

import { Menu, Scissors } from "lucide-react"


import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { navigationItems, siteInfo } from "@/lib/site-data";
import { Button } from "@/components/ui/button"

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    if (href.startsWith("/#")) {
      return false;
    }

    return pathname === href;
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-full focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Scissors className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">{siteInfo.name}</p>
            <p className="text-sm text-muted-foreground">{siteInfo.city}</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Huvudnavigering">
          {navigationItems.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:bg-muted hover:text-foreground",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <Button
            asChild
            className="ml-2 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-95"
          >
            <Link href="/boka">Boka tid</Link>
          </Button>
        </nav>

        <div className="lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="rounded-full"
                aria-label="Öppna meny"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full max-w-sm border-l-border bg-background">
              <SheetHeader className="text-left">
                <SheetTitle className="text-2xl font-semibold">Meny</SheetTitle>
                <SheetDescription>
                  Här hittar du alla sidor och vår snabbaste väg till bokning.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-8 flex flex-col gap-2">
                {navigationItems.map((item) => {
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "rounded-2xl px-4 py-3 text-base font-medium transition-all duration-200 hover:bg-muted hover:text-foreground",
                        active ? "bg-secondary text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                <Button
                  asChild
                  size="lg"
                  className="mt-4 rounded-full transition-all duration-200 active:scale-95"
                >
                  <Link href="/boka" onClick={() => setOpen(false)}>
                    Boka tid
                  </Link>
                </Button>
              </div>

              <div className="mt-10 rounded-[1.5rem] border border-border bg-muted/50 p-5">
                <p className="text-sm font-medium text-foreground">Direktkontakt</p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <p>{siteInfo.phone}</p>
                  <p>{siteInfo.email}</p>
                  <p>{siteInfo.address}</p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
