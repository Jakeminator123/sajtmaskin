import { Separator } from "@/components/ui/separator";
import { Globe, Link2, Mail } from "lucide-react";

const footerLinks = {
  Tjänster: [
    { label: "Webbdesign", href: "#" },
    { label: "E-handel", href: "#" },
    { label: "SEO", href: "#" },
    { label: "Hosting", href: "#" },
  ],
  Företaget: [
    { label: "Om oss", href: "#" },
    { label: "Karriär", href: "#" },
    { label: "Blogg", href: "#" },
    { label: "Kontakt", href: "#" },
  ],
  Resurser: [
    { label: "Dokumentation", href: "#" },
    { label: "Guider", href: "#" },
    { label: "Support", href: "#" },
    { label: "Integritet", href: "#" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <p className="text-lg font-bold tracking-tight">[Företagsnamn]</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              En flexibel starter för moderna företagssajter, kampanjsidor och innehållsdrivna upplevelser.
            </p>
            <div className="flex gap-3">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
                <Globe className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
                <Link2 className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="E-post">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading} className="space-y-3">
              <p className="text-sm font-semibold">{heading}</p>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} [Företagsnamn]. Alla rättigheter förbehållna.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Integritetspolicy
            </a>
            <a href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Villkor
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
