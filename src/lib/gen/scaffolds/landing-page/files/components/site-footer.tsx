import { ArrowUpRight } from "lucide-react";

const columns = {
  "[Kolumn 1]": ["[Länk 1]", "[Länk 2]", "[Länk 3]", "[Länk 4]"],
  "[Kolumn 2]": ["[Länk 1]", "[Länk 2]", "[Länk 3]", "[Länk 4]"],
};

export function SiteFooter() {
  return (
    <footer className="px-6 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 rounded-4xl border bg-card/80 p-8 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-lg font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            [Kort företagsbeskrivning i footern.]
          </p>
          <a href="mailto:hello@example.com" className="inline-flex items-center gap-2 text-sm font-medium">
            hello@example.com <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        {Object.entries(columns).map(([title, links]) => (
          <div key={title} className="space-y-3">
            <p className="text-sm font-medium">{title}</p>
            <div className="space-y-2">
              {links.map((link) => (
                <a key={link} href="#" className="block text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {link}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}

export default SiteFooter;
