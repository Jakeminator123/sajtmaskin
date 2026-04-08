
import Link from "next/link";
import { GithubIcon as Github, Linkedin, Mail, MapPin, PhoneCall } from "lucide-react"

import { Separator } from "@/components/ui/separator";
import {
  footerPageLinks,
  footerServiceLinks,
  siteConfig,
} from "@/lib/site-data";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/80 bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Senior partner för systemutveckling, molnlösningar och
                IT-säkerhet. Vi hjälper företag i Stockholm att bygga stabila
                plattformar med tydlig styrning och snabb start.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={siteConfig.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground"
                aria-label="Följ TechPartner AB på LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                href={siteConfig.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground"
                aria-label="Besök TechPartner AB på GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
              <a
                href={siteConfig.emailHref}
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground"
                aria-label="Skicka e-post till TechPartner AB"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-tight">Sidor</h2>
            <ul className="space-y-3 text-sm">
              {footerPageLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-tight">Tjänster</h2>
            <ul className="space-y-3 text-sm">
              {footerServiceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-tight">Kontakt</h2>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <PhoneCall className="mt-0.5 h-4 w-4 text-primary" />
                <a
                  href={siteConfig.phoneHref}
                  className="transition-colors hover:text-foreground"
                >
                  {siteConfig.phoneDisplay}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-primary" />
                <a
                  href={siteConfig.emailHref}
                  className="transition-colors hover:text-foreground"
                >
                  {siteConfig.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <a
                  href={siteConfig.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  {siteConfig.address}
                </a>
              </li>
              <li>{siteConfig.hours}</li>
            </ul>
          </div>
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 TechPartner AB</p>
          <p>Trygg teknikpartner för företag som vill bygga långsiktigt.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
