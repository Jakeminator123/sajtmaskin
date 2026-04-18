import { MapPin, Mail, Phone, Clock } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-secondary/40 px-6 py-14 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.2fr_0.9fr_0.9fr_0.9fr]">
        <div className="space-y-3">
          <p className="text-base font-semibold tracking-tight">[Företagsnamn]</p>
          <p className="max-w-sm text-sm leading-7 text-muted-foreground">
            [Kort ingress som beskriver företaget, profession och de primära målgrupperna.]
          </p>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            [Auktorisation / medlemskap / org.nr]
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Besöksadress</p>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>[Gatuadress]<br />[Postnummer] [Ort]</span>
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Kontakt</p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href="tel:[+46 8 000 00 00]" className="hover:text-foreground">[+46 8 000 00 00]</a>
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a href="mailto:[info@företag.se]" className="hover:text-foreground">[info@företag.se]</a>
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Öppettider</p>
          <p className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>Mån–Fre [08–17]<br />Lör–Sön [stängt]</span>
          </p>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} [Företagsnamn]. Alla rättigheter förbehållna.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-foreground">Integritetspolicy</a>
          <a href="#" className="hover:text-foreground">Cookies</a>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
