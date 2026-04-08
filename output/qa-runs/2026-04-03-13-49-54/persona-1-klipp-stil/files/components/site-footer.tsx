
import Link from "next/link";
import { Facebook, Instagram, Mail, MapPin, Phone, Scissors } from "lucide-react"

import { businessInfo, navItems, socialLinks } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/70 bg-muted/50">
      <div className="section-shell py-16">
        <h2 className="sr-only">Sidfot</h2>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.7fr_0.8fr_0.8fr]">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold tracking-tight">Klipp & Stil</p>
                <p className="text-sm text-muted-foreground">Frisörsalong i Göteborg</p>
              </div>
            </div>
            <p className="max-w-sm text-base leading-7 text-muted-foreground">
              En varm och personlig salong för dig som vill känna dig trygg från första konsultation till sista finish. Hos oss får du tydliga råd, lugn atmosfär och ett resultat som håller i vardagen.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                {businessInfo.address}, {businessInfo.postalCode} {businessInfo.city}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <a href={businessInfo.phoneHref} className="hover:text-foreground">
                  {businessInfo.phone}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href={businessInfo.emailHref} className="hover:text-foreground">
                  {businessInfo.email}
                </a>
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Snabblänkar</h3>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {navItems.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="transition-colors hover:text-foreground">
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
            <h3 className="text-lg font-semibold">Öppettider</h3>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {businessInfo.hours.map((item) => (
                <li key={item.days} className="flex items-center justify-between gap-4">
                  <span>{item.days}</span>
                  <span>{item.hours}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Följ oss</h3>
            <ul className="mt-5 space-y-4 text-sm text-muted-foreground">
              <li>
                <a
                  href={socialLinks[0].href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 transition-colors hover:text-foreground"
                >
                  <Instagram className="h-4 w-4 text-primary" />
                  <span>{socialLinks[0].handle}</span>
                </a>
              </li>
              <li>
                <a
                  href={socialLinks[1].href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 transition-colors hover:text-foreground"
                >
                  <Facebook className="h-4 w-4 text-primary" />
                  <span>{socialLinks[1].handle}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 Klipp & Stil</p>
          <p>{businessInfo.address} • {businessInfo.phone} • {businessInfo.email}</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
