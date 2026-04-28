import Link from "next/link";
import {
  Clock3,
  Gamepad as Gamepad2,
  Camera as Instagram,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/70 bg-card/70">
      <div className="section-shell py-12">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr_0.85fr_0.95fr]">
          <div className="space-y-4">
            <div>
              <p className="font-display text-2xl tracking-tight text-foreground">
                Glöd Burger Club
              </p>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Smashburgare, gröna toppar, snabba kvällar och ett eget
                hamburgerspel mitt i upplevelsen.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary" />
                <span>S:t Eriksgatan 45, 112 34 Stockholm</span>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 text-primary" />
                <a
                  href="tel:+46812345678"
                  className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  08-123 45 678
                </a>
              </div>
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 text-primary" />
                <a
                  href="mailto:hej@glodburgerclub.se"
                  className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  hej@glodburgerclub.se
                </a>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Sidor
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link
                  href="/"
                  className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Om oss
                </Link>
              </li>
              <li>
                <Link
                  href="/spel"
                  className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Hamburgerspel
                </Link>
              </li>
              <li>
                <Link
                  href="/om"
                  className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Bakom grillen
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Öppettider
            </p>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                Mån–tors: 11:00–21:00
              </li>
              <li className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                Fre–lör: 11:00–23:00
              </li>
              <li className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                Sön: 12:00–20:00
              </li>
              <li className="flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-primary" />
                Spelet är öppet hela tiden
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Följ vibben
            </p>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link
                href="https://www.instagram.com/glodburgerclub"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Instagram className="h-4 w-4" />
                Instagram
              </Link>
              <Link
                href="mailto:hej@glodburgerclub.se"
                className="inline-flex items-center gap-2 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Mail className="h-4 w-4" />
                Maila oss
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border/70 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Glöd Burger Club. All smak, all vibe.</p>
          <p>Byggd för mobil, desktop och sena burgersug.</p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;