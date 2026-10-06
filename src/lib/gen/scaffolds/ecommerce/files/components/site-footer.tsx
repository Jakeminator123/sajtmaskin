import Link from "next/link";

const footerLinks = {
  Butik: [
    { label: "Alla produkter", href: "/products" },
    { label: "Kategorier", href: "/categories" },
    { label: "Kategori 1", href: "/category/category-1" },
    { label: "Kategori 2", href: "/category/category-2" },
  ],
  Info: [
    { label: "Om oss", href: "/om" },
    { label: "Produkter", href: "/products" },
    { label: "Kategorier", href: "/categories" },
    { label: "Hem", href: "/" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-3">
        <div className="space-y-4">
          <p className="text-lg font-bold tracking-tight">[Butiksnamn]</p>
          <p className="text-muted-foreground max-w-sm text-sm leading-7">
            Demokatalog för [produkttyp]. Lokal demokorg; betalning, frakt och lager är inte
            anslutna.
          </p>
        </div>
        {Object.entries(footerLinks).map(([title, items]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {items.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground block text-sm transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mx-auto mt-10 max-w-6xl border-t pt-6 text-center text-xs">
        &copy; 2026 [Butiksnamn]. Alla rättigheter förbehållna.
      </div>
    </footer>
  );
}

export default SiteFooter;
