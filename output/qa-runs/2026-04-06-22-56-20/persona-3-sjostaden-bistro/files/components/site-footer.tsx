
import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone, Youtube } from "lucide-react"

import { Separator } from "@/components/ui/separator";
import { siteConfig } from "@/lib/site-data";


const socialIcons = {
  Instagram,
  Facebook,
  YouTube: Youtube,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                {siteConfig.name}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                {siteConfig.longDescription}
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Navigation</h2>
            <ul className="mt-4 space-y-3">
              {siteConfig.navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Kontakt</h2>
            <ul className="mt-4 space-y-4 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{siteConfig.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" />
                <a
                  href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                  className="transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {siteConfig.phone}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" />
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {siteConfig.email}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold">Öppettider</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {siteConfig.openingHours.map((item) => (
                <li key={item.day} className="flex items-center justify-between gap-4">
                  <span>{item.day}</span>
                  <span className="text-foreground">{item.time}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-3">
              {siteConfig.socialLinks.map((social) => {
                const Icon = socialIcons[social.label as keyof typeof socialIcons];

                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={social.label}
                    className="rounded-full border border-border bg-card p-2 text-muted-foreground transition-all duration-200 hover:scale-105 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <Separator className="my-8 bg-border/70" />

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 Sjöstaden Bistro</p>
          <p>Lunch, à la carte och catering i Malmö.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
