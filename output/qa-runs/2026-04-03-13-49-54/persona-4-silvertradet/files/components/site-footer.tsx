
import Link from "next/link";
import {
  Clock3,
  Facebook,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Pin,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { import { } from "lucide-react"
import { contactDetails, navigation, siteName, socialLinks } from "@/lib/site-data";
  contactDetails,
  navigation,
  socialLinks,
  siteName,
} from "@/lib/site-data";

const assortmentLinks = [
  { label: "Ringar", href: "/galleri" },
  { label: "Halsband", href: "/galleri" },
  { label: "Armband", href: "/galleri" },
  { label: "Örhängen", href: "/galleri" },
];

const socialIcons = {
  Instagram,
  Facebook,
  Pinterest: Pin,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-muted/40">
      <div className="section-shell py-16 sm:py-20">
        <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-5">
            <div>
              <p className="font-display text-2xl font-semibold tracking-tight">
                {siteName}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                Handgjorda silversmycken i liten skala, skapade för att bäras
                länge. Vi kombinerar tidlös form, trygga köp och personlig
                service från vår studio i Göteborg.
              </p>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>{contactDetails.address}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" />
                <a
                  href={`tel:${contactDetails.phone.replace(/\s|-/g, "")}`}
                  className="transition-colors hover:text-foreground"
                >
                  {contactDetails.phone}
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" />
                <a
                  href={`mailto:${contactDetails.email}`}
                  className="transition-colors hover:text-foreground"
                >
                  {contactDetails.email}
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Clock3 className="h-4 w-4 text-primary" />
                <span>{contactDetails.hours}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sidor
            </p>
            <div className="space-y-3">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sortiment
            </p>
            <div className="space-y-3">
              {assortmentLinks.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Följ Silverträdet
            </p>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">
              Följ oss för nya släpp, behind the scenes och skötselråd. Där
              delar vi även detaljer från verkstaden och kommande kollektioner.
            </p>

            <div className="flex flex-wrap gap-3">
              {socialLinks.map((link) => {
                const Icon = socialIcons[link.name as keyof typeof socialIcons];

                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-muted-foreground transition-all duration-200 hover:border-primary/20 hover:text-foreground"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 {siteName}</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/kontakt" className="transition-colors hover:text-foreground">
              Kontakt
            </Link>
            <Link href="/priser" className="transition-colors hover:text-foreground">
              Priser
            </Link>
            <Link href="/galleri" className="transition-colors hover:text-foreground">
              Galleri
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
