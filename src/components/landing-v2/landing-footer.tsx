"use client"

import { Zap } from "lucide-react"
import Link from "next/link"
import { getSeoLandingHubLinks } from "@/lib/seo-landing-pages/registry"

export function LandingFooter() {
  return (
    <footer className="px-6 pt-10 pb-28 border-t border-border/15">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm text-foreground font-(--font-heading)">SajtMaskin</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Professionella hemsidor f&ouml;r svenska f&ouml;retag &mdash; snabbt, enkelt och med riktig teknik bakom.
            </p>
            <p className="mt-3 max-w-[200px] text-[10px] leading-relaxed text-muted-foreground/70">
              En tj&auml;nst fr&aring;n{" "}
              <a
                href="/om"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Pretty Good B.V.
              </a>
              .
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Produkt</h4>
            <ul className="space-y-2">
              <li>
                <a href="/teknik#funktioner" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Funktioner
                </a>
              </li>
              <li>
                <a href="/analys" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Analys
                </a>
              </li>
              <li>
                <a href="/teknik" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Teknik
                </a>
              </li>
              <li>
                <Link href="/#priser" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Priser
                </Link>
              </li>
              <li>
                <a href="/templates" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Templates
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">F&ouml;retag</h4>
            <ul className="space-y-2">
              <li>
                <a href="/om" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Om oss
                </a>
              </li>
              {/* Blogg-länken är dold tills det finns publicerade inlägg — en tom
                  blogg ("Inga inlägg ännu") sänker förtroendet. Sidan /blogg finns kvar. */}
              <li>
                <a
                  href="mailto:support@sajtmaskin.se?subject=Karri%C3%A4r"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Karri&auml;r
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@sajtmaskin.se"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Kontakt
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Juridiskt</h4>
            <ul className="space-y-2">
              <li>
                <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Integritetspolicy
                </a>
              </li>
              <li>
                <a href="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Anv&auml;ndarvillkor
                </a>
              </li>
              <li>
                <a
                  href="/privacy#gdpr"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  GDPR
                </a>
              </li>
              <li>
                <a
                  href="/privacy#cookies"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cookies
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mb-10 border-t border-border/15 pt-8">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
            Guider
          </h4>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {getSeoLandingHubLinks().map((link) => (
              <li key={link.slug}>
                <Link
                  href={link.href}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-6 border-t border-border/15">
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} Pretty Good B.V. Alla r&auml;ttigheter f&ouml;rbeh&aring;llna.
          </p>
        </div>
      </div>
    </footer>
  )
}
