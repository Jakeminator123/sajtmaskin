
import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react"

import { Separator } from "@/components/ui/separator";

import { navigation, openingHours, siteConfig, socialLinks } from "@/lib/site-data";

export function SiteFooter() {
  const hoursSummary = openingHours
    .map((slot) => `${slot.label} ${slot.hours}`)
    .join(" • ");

  return (
    <footer className="border-t border-border/70 bg-card/50">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="font-display text-2xl tracking-tight text-foreground">{siteConfig.name}</p>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                En mörk och varm bistro med modern skandinavisk mat, säsongstänk och omtanke i
                varje detalj.
              </p>
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <a
                href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}
                className="flex items-center gap-3 transition-colors hover:text-foreground"
              >
                <Phone className="h-4 w-4 text-primary" />
                {siteConfig.phone}
              </a>
              <a
                href={`mailto:${siteConfig.email}`}
                className="flex items-center gap-3 transition-colors hover:text-foreground"
              >
                <Mail className="h-4 w-4 text-primary" />
                {siteConfig.email}
              </a>
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{siteConfig.fullAddress}</span>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/80">
              Navigering
            </p>
            <ul className="space-y-3">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/80">
              Öppettider
            </p>
            <ul className="space-y-3">
              {openingHours.map((slot) => (
                <li key={slot.label} className="text-sm text-muted-foreground">
                  <span className="block text-foreground">{slot.label}</span>
                  <span>{slot.hours}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary/80">
              Följ oss
            </p>
            <ul className="space-y-3">
              {socialLinks.map((link) => {
                const Icon = link.label === "Instagram" ? Instagram : Facebook;

                return (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span>
                        {link.label} <span className="text-muted-foreground/80">{link.handle}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <Separator className="my-10 bg-border/80" />

        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 Sjöstaden Bistro</p>
          <p>{hoursSummary}</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;