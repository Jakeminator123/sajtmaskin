import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Funktioner", href: "#features" },
  { label: "Priser", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingHeader() {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          [Produktnamn]
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {item.label}
            </a>
          ))}
          <Button asChild size="sm" className="rounded-full">
            <a href="#pricing">Se exempelpriser</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
