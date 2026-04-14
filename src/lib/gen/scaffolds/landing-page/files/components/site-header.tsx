"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";

const navItems = [
  { label: "[Sektion 1]", href: "#erbjudande" },
  { label: "[Sektion 2]", href: "#om" },
  { label: "Kontakt", href: "#kontakt" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Företagsnamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">[CTA]</Button>
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
              <a key={item.href} href={item.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <Button className="mt-2 rounded-full">[CTA]</Button>
          </div>
        </div>
      )}
    </header>
  );
}

export default SiteHeader;
