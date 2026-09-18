import Link from "next/link";
import { getSeoLandingHubLinks } from "@/lib/seo-landing-pages/registry";

const productLinks = [
  { label: "Skapa", href: "/" },
  { label: "Analys", href: "/analys" },
  { label: "Templates", href: "/templates" },
  { label: "Priser", href: "/buy-credits" },
];

const companyLinks = [
  { label: "Om oss", href: "/om" },
  { label: "Sajtstudio.se", href: "https://sajtstudio.se", external: true },
];

const legalLinks = [
  { label: "Integritetspolicy", href: "/privacy" },
  { label: "Användarvillkor", href: "/terms" },
  { label: "GDPR", href: "/privacy#gdpr" },
  { label: "Cookies", href: "/privacy#cookies" },
];

export function Footer() {
  return (
    <footer className="border-border/50 bg-background border-t">
      <div className="mx-auto max-w-7xl px-6 pt-12 pb-28">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-foreground text-lg font-semibold tracking-tight">
              Sajtmaskin
            </Link>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              AI-driven webbplatsgenerering. Skapa professionella webbplatser på minuter.
            </p>
            <p className="text-muted-foreground/60 mt-4 text-xs">
              En tjänst från{" "}
              <a
                href="/om"
                className="hover:text-foreground transition-colors"
              >
                Pretty Good B.V.
              </a>
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-foreground text-sm font-medium">Produkt</h3>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-foreground text-sm font-medium">Företag</h3>
            <ul className="mt-3 space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  {"external" in link && link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label} &darr;
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-foreground text-sm font-medium">Juridiskt</h3>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-border/50 mt-10 border-t pt-8">
          <h3 className="text-foreground text-sm font-medium">Guider</h3>
          <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {getSeoLandingHubLinks().map((link) => (
              <li key={link.slug}>
                <Link
                  href={link.href}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom */}
        <div className="border-border/50 mt-10 border-t pt-6">
          <p className="text-muted-foreground/60 text-center text-xs">
            &copy; {new Date().getFullYear()} Pretty Good B.V. Alla rättigheter förbehållna.
          </p>
        </div>
      </div>
    </footer>
  );
}
