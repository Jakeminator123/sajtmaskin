"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, ArrowRight } from "lucide-react";

const navItems = [
  { label: "Tjänster", href: "#tjanster" },
  { label: "Projekt", href: "#projekt" },
  { label: "Om oss", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="text-lg font-bold tracking-tight">
          [Företagsnamn]
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
          <Button size="sm">
            Boka möte <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </nav>

        <button
          type="button"
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Öppna meny"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-6 pb-4 pt-2 space-y-3">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="block text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <Button size="sm" className="w-full">
            Boka möte <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </nav>
      )}
    </header>
  );
}

export default SiteHeader;
