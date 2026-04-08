"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Scissors, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { businessInfo, navItems } from "@/lib/site";

function isNavItemActive(pathname: string, href: string, isAnchor: boolean) {
  if (isAnchor) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="section-shell pt-4">
        <div className="paper-panel-strong flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Scissors className="h-5 w-5" />
            </div>
            <Link href="/" className="min-w-0">
              <span className="block font-display text-xl font-semibold tracking-tight">Klipp & Stil</span>
              <span className="block text-xs text-muted-foreground">Frisörsalong i Göteborg</span>
            </Link>
          </div>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Huvudnavigation">
            {navItems.map((item) => {
              const active = isNavItemActive(pathname, item.href, item.isAnchor);

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm transition-all duration-200 hover:bg-secondary",
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden lg:block">
            <Button asChild className="rounded-full px-6">
              <Link href="/boka">Boka tid</Link>
            </Button>
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="outline" size="icon" aria-label="Öppna meny" className="rounded-full">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm border-l border-border bg-card">
              <SheetHeader className="text-left">
                <SheetTitle className="font-display text-2xl">Klipp & Stil</SheetTitle>
                <SheetDescription>
                  Varm frisörsalong mitt i Göteborg. Boka tid online eller kontakta oss om du vill ha hjälp att välja behandling.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-8 space-y-2">
                {navItems.map((item) => {
                  const active = isNavItemActive(pathname, item.href, item.isAnchor);

                  return (
                    <SheetClose key={item.label} asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center justify-between rounded-[1.25rem] border px-4 py-3 text-base transition-all duration-200",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/20 hover:bg-secondary",
                        )}
                      >
                        <span>{item.label}</span>
                        <X className="h-4 w-4 opacity-0" aria-hidden="true" />
                      </Link>
                    </SheetClose>
                  );
                })}
              </div>

              <div className="mt-8 rounded-[1.5rem] border bg-secondary/60 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Kontakt</p>
                <p className="mt-3 text-lg font-medium">{businessInfo.phone}</p>
                <p className="text-sm text-muted-foreground">{businessInfo.email}</p>
                <Button asChild className="mt-4 w-full rounded-full">
                  <Link href="/boka" onClick={() => setOpen(false)}>
                    Boka tid
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
