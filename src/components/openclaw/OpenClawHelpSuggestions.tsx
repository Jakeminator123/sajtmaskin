"use client";

import { X } from "lucide-react";

const SUGGESTIONS: { group: string; items: string[] }[] = [
  {
    group: "Komma igång",
    items: [
      "Skapa en restaurangsida",
      "Bygg en konsultsajt",
      "Gör en portfolio",
      "Skapa en frisörsalong-sajt",
      "Bygg en landningssida för en app",
      "Gör en webbplats för en advokatbyrå",
      "Skapa en sida för ett gym",
      "Bygg en sajt för en fotograf",
    ],
  },
  {
    group: "Design & Layout",
    items: [
      "Byt färgtema",
      "Lägg till en hero-sektion",
      "Gör sidan mobilanpassad",
      "Byt typsnitt",
      "Lägg till en bildkarusell",
      "Skapa en grid-layout",
      "Lägg till en sticky navbar",
      "Gör designen mer minimalistisk",
    ],
  },
  {
    group: "Innehåll",
    items: [
      "Skriv en Om oss-text",
      "Skapa en FAQ-sektion",
      "Lägg till prislista",
      "Skriv en produktbeskrivning",
      "Skapa en blogg-sektion",
      "Skriv en CTA-text",
      "Lägg till kundrecensioner",
      "Skriv en introduktionstext",
    ],
  },
  {
    group: "Funktioner",
    items: [
      "Lägg till kontaktformulär",
      "Integrera Google Maps",
      "Lägg till nyhetsbrev",
      "Skapa en bokningsfunktion",
      "Lägg till sociala medier-länkar",
      "Integrera en chattbot",
      "Lägg till en sökfunktion",
      "Skapa en inloggningssida",
    ],
  },
  {
    group: "Förbättra",
    items: [
      "Snabba upp laddningstiden",
      "Förbättra SEO",
      "Gör texten mer säljande",
      "Förbättra tillgängligheten",
      "Optimera bilderna",
      "Gör navigeringen tydligare",
      "Lägg till animationer",
      "Förbättra kontrast och läsbarhet",
    ],
  },
];

interface OpenClawHelpSuggestionsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (suggestion: string) => void;
}

export function OpenClawHelpSuggestions({ isOpen, onClose, onSelect }: OpenClawHelpSuggestionsProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Vad vill du göra?</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5" style={{ maxHeight: "calc(80vh - 52px)" }}>
          {SUGGESTIONS.map((group) => (
            <div key={group.group}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.group}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => { onSelect(item); onClose(); }}
                    className="rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted/60"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
