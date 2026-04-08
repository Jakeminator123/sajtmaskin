"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useState } from "react";

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
import { siteConfig } from "@/lib/site-data";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex flex-col justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="text-2xl font-semibold tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary" style={{ fontFamily: "var(--font-display)" }}>
            Sjöstaden Bistro
          </span>
          <span className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Malmö
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {siteConfig.navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(link.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <Button asChild className="rounded-full px-6 active:scale-95">
            <Link href="/boka">Boka bord</Link>
          </Button>
        </div>

        <div className="lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Öppna meny"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[88vw] max-w-sm border-border bg-card px-6"
            >
              <SheetHeader className="mt-6 text-left">
                <SheetTitle className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                  Sjöstaden Bistro
                </SheetTitle>
                <SheetDescription className="text-muted-foreground">
                  Navigera mellan sidorna och boka bord direkt från mobilen.
                </SheetDescription>
              </SheetHeader>

              <nav className="mt-8 flex flex-col gap-2">
                {siteConfig.navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "rounded-2xl px-4 py-3 text-base font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive(link.href)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-foreground hover:bg-muted",
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-8 rounded-3xl border border-border bg-muted/40 p-5">
                <p className="text-sm text-muted-foreground">
                  Boka lunch, middag eller skicka en förfrågan om catering.
                  Vi återkommer snabbt under våra öppettider.
                </p>
                <Button asChild className="mt-4 w-full rounded-full active:scale-95">
                  <Link href="/boka" onClick={() => setOpen(false)}>
                    Boka bord
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
