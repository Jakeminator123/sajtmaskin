import { GithubIcon as Github, Linkedin, Mail } from "lucide-react"
import Link from "next/link";


import { Separator } from "@/components/ui/separator";

import { footerNav, siteConfig } from "@/lib/site-data";

const socialIcons = {
  LinkedIn: Linkedin,
  GitHub: Github,
  "E-post": Mail,
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_1fr]">
          <div className="space-y-5">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Vi hjälper företag att bygga stabila digitala plattformar med
                tydlig affärsnytta. Fokus ligger på systemutveckling,
                molnlösningar och IT-säkerhet som håller över tid.
              </p>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{siteConfig.address}</p>
              <p>{siteConfig.phone}</p>
              <p>{siteConfig.email}</p>
              <p>{siteConfig.hours}</p>
            </div>

            <div className="flex items-center gap-3">
              {siteConfig.socialLinks.map((social) => {
                const Icon = socialIcons[social.label as keyof typeof socialIcons];

                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target={social.href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      social.href.startsWith("http") ? "noreferrer" : undefined
                    }
                    aria-label={social.label}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {Object.entries(footerNav).map(([heading, links]) => (
            <div key={heading} className="space-y-4">
              <p className="text-sm font-semibold">{heading}</p>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">© 2025 TechPartner AB</p>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            TechPartner AB arbetar med företag i Stockholm och övriga Sverige
            som behöver en trygg teknikpartner för utveckling, moln och
            säkerhet.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
