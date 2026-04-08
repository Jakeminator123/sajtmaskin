
import Link from "next/link";
import { Clock3, GithubIcon as Github, Linkedin, Mail, MapPin, Phone } from "lucide-react"

import { services, siteConfig } from "@/lib/site-data";

const socialIcons = {
  linkedin: Linkedin,
  github: Github,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/50">
      <div className="section-shell py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
          <div className="max-w-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-card p-1 shadow-sm">
                <span className="rounded-lg bg-primary/90" />
                <span className="rounded-lg bg-accent" />
                <span className="rounded-lg bg-secondary" />
                <span className="rounded-lg bg-foreground/85" />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-foreground">
                  {siteConfig.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Systemutveckling, moln och säkerhet
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Vi hjälper företag i Stockholm att ta nästa steg med rätt teknik, rätt struktur och ett tydligt säkerhetsfokus.
              Vår roll är att skapa lugn i komplexa teknikmiljöer och ge beslutsfattare bättre kontroll.
            </p>
            <div className="flex items-center gap-3">
              {siteConfig.socialLinks.map((link) => {
                const Icon = socialIcons[link.icon];

                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Sidor
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="transition-colors hover:text-foreground">
                  Hem
                </Link>
              </li>
              <li>
                <Link href="/om-oss" className="transition-colors hover:text-foreground">
                  Om oss
                </Link>
              </li>
              <li>
                <Link href="/#tjanster" className="transition-colors hover:text-foreground">
                  Tjänster
                </Link>
              </li>
              <li>
                <Link href="/priser" className="transition-colors hover:text-foreground">
                  Priser
                </Link>
              </li>
              <li>
                <Link href="/kontakt" className="transition-colors hover:text-foreground">
                  Kontakt
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Erbjudanden
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {services.map((service) => (
                <li key={service.title}>
                  <Link href="/#tjanster" className="transition-colors hover:text-foreground">
                    {service.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Kontakt
            </h2>
            <ul className="mt-5 space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-primary" />
                <a href={siteConfig.phoneHref} className="transition-colors hover:text-foreground">
                  {siteConfig.phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-primary" />
                <a href={siteConfig.emailHref} className="transition-colors hover:text-foreground">
                  {siteConfig.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{siteConfig.address}</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 text-primary" />
                <span>{siteConfig.officeHours}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 {siteConfig.name}</p>
          <p>Arbetar med företag i Stockholm och närliggande regioner.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
