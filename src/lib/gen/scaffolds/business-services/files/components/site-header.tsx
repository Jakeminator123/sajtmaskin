"use client";

import { Button } from "@/components/ui/button";
import { Menu, Phone } from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "Tjänster", href: "#tjanster" },
  { label: "Så arbetar vi", href: "#process" },
  { label: "Priser", href: "#priser" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">[Företagsnamn]</span>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            [Bransch]
          </span>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <a
            href="tel:[+46 8 000 00 00]"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Phone className="h-3.5 w-3.5" />
            [+46 8 000 00 00]
          </a>
          <Button size="sm" className="rounded-full">Boka möte</Button>
        </nav>

        <button
          type="button"
          aria-label="Öppna meny"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border md:hidden"
          onClick={() => setOpen((value) => !value)}
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="border-t bg-background px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <Button className="mt-2 rounded-full">Boka möte</Button>
          </div>
        </div>
      )}
    </header>
  );
}

export default SiteHeader;
