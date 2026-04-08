
import Link from "next/link";

import { Clock3, Facebook, Instagram, Mail, MapPin, Phone, Scissors } from "lucide-react"

import { Separator } from "@/components/ui/separator";
import { footerNavigation, googleMapsUrl, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/50">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary/35 text-primary">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-xl font-semibold">{siteConfig.name}</p>
                <p className="text-sm text-muted-foreground">Varm frisörsalong i Göteborg</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">
              Hos oss möts du av ett lugnt tempo, personlig rådgivning och hantverk som håller i både form och känsla.
              Vi hjälper dig med klippning, färgning, styling och skäggvård i en salong där det ska kännas enkelt att komma tillbaka.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-semibold">Navigation</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {footerNavigation.map((item) => (
                <li key={item.href}>
                  <Link className="transition-colors hover:text-foreground" href={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-semibold">Kontakt & öppettider</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-accent" />
                <a className="transition-colors hover:text-foreground" href={googleMapsUrl} target="_blank" rel="noreferrer">
                  {siteConfig.address.street}, {siteConfig.address.postalCode} {siteConfig.address.city}
                </a>
              </p>
              <p className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-accent" />
                <a className="transition-colors hover:text-foreground" href={`tel:${siteConfig.phone.replace(/\s|-/g, "")}`}>
                  {siteConfig.phone}
                </a>
              </p>
              <p className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-accent" />
                <a className="transition-colors hover:text-foreground" href={`mailto:${siteConfig.email}`}>
                  {siteConfig.email}
                </a>
              </p>
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 text-accent" />
                <div>
                  {siteConfig.hours.map((item) => (
                    <p key={item.label}>
                      {item.label} {item.opens.slice(0, 5)}–{item.closes.slice(0, 5)}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-semibold">Följ oss</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <a
                href={siteConfig.socials[0].href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 transition-all duration-200 hover:border-accent/30 hover:shadow-sm"
              >
                <Instagram className="h-4 w-4 text-accent" />
                <span>{siteConfig.socials[0].handle}</span>
              </a>
              <a
                href={siteConfig.socials[1].href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3 transition-all duration-200 hover:border-accent/30 hover:shadow-sm"
              >
                <Facebook className="h-4 w-4 text-accent" />
                <span>{siteConfig.socials[1].handle}</span>
              </a>
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 Klipp & Stil</p>
          <p>Storgatan 12, 411 38 Göteborg · {siteConfig.phone} · {siteConfig.email}</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
