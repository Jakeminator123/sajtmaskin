"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "Skapa" },
  { href: "/templates", label: "Mallar" },
  { href: "/buy-credits", label: "Priser" },
  { href: "/faq", label: "FAQ" },
  { href: "/om", label: "Om oss" },
  { href: "#funktioner", label: "Funktioner" },
  { href: "#teknik", label: "Teknik" },
];

const legalLinks = [
  { href: "/privacy", label: "Integritet" },
  { href: "/terms", label: "Villkor" },
];

export function SiteNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground/70 hover:text-foreground"
          aria-label="Meny"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 border-border bg-card">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-left text-sm font-medium text-foreground">
            Meny
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2.5 text-sm transition-colors ${
                pathname === link.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="my-2 border-t border-border" />
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
