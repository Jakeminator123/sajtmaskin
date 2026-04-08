
import Link from "next/link";

import { Facebook, Instagram, Mail, MapPin, Phone, Scissors } from "lucide-react"

import {
  navigationItems,
  openingHours,
  siteInfo,
  socialLinks,
} from "@/lib/site-data";

const socialIcons = {
  Instagram,
  Facebook,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">{siteInfo.name}</p>
                <p className="text-sm text-muted-foreground">{siteInfo.city}</p>
              </div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {siteInfo.name} är salongen för dig som vill ha personlig rådgivning,
              noggrann klippning och färgning med ett varmt bemötande mitt i Göteborg.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Navigation</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {navigationItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/boka" className="transition-colors hover:text-foreground">
                  Boka tid
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Kontakt</h2>
            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{siteInfo.address}</span>
              </p>
              <p className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-primary" />
                <a href={`tel:${siteInfo.phone.replace(/\s/g, "")}`} className="hover:text-foreground">
                  {siteInfo.phone}
                </a>
              </p>
              <p className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-primary" />
                <a href={`mailto:${siteInfo.email}`} className="hover:text-foreground">
                  {siteInfo.email}
                </a>
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Öppettider</h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {openingHours.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4">
                  <span>{item.label}</span>
                  <span className="font-medium text-foreground">{item.value}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-3">
              {socialLinks.map((link) => {
                const Icon = socialIcons[link.label as keyof typeof socialIcons];

                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={link.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-all duration-200 hover:scale-[1.02] hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>© 2025 {siteInfo.name}</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
