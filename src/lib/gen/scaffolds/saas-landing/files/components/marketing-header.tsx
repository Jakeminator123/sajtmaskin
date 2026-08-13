import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Funktioner", href: "#features" },
  { label: "Priser", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="/" className="font-semibold tracking-tight">
          {"{{PRODUCT_NAME}}"}
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </a>
          ))}
          <Button size="sm" className="rounded-full">Starta gratis</Button>
        </nav>
      </div>
    </header>
  );
}
