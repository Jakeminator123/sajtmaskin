# Exempel: Scaffold (runtime grundmall)

## Vad det är

En scaffold är **startkod** som AI-modellen utgår ifrån. Den innehåller riktiga
filer (layout, sidor, header, footer, CSS) anpassade för Sajtmaskins stack:
Tailwind 4, shadcn/ui, Next.js App Router, svensk text.

## Aktuellt exempel: `restaurant` scaffold

```typescript
// src/lib/gen/scaffolds/restaurant/manifest.ts (förkortad)
export const restaurantManifest: ScaffoldManifest = {
  id: "restaurant",
  family: "landing-page",
  label: "Restaurang & Tjänster",
  description: "Starter for restaurants, cafés, salons, gyms...",
  buildIntents: ["website", "template"],
  tags: ["restaurang", "café", "frisör", "meny", "öppettider", "bokning"],
  promptHints: [
    "Keep the structure: hero, menu/services, opening hours, location, booking CTA.",
  ],
  files: [
    { path: "app/globals.css",    content: "/* Tailwind 4 warm oklch theme */" },
    { path: "app/layout.tsx",     content: "/* Root layout med Inter, sv, header+footer */" },
    { path: "app/page.tsx",       content: "/* Hero + Meny + Öppettider + Hitta hit + Citat */" },
    { path: "components/site-header.tsx", content: "/* Sticky nav: Meny, Öppettider, Kontakt */" },
    { path: "components/site-footer.tsx", content: "/* Kontaktinfo, adress, sociala länkar */" },
  ],
};
```

## Hur det används vid runtime

1. Användare skriver: "Jag vill ha en sajt för mitt café i Uppsala"
2. Matchern hittar "café" i `RESTAURANT_KEYWORDS` → väljer `restaurant` scaffold
3. `serializeScaffoldForPrompt()` omvandlar filerna till text i systemprompt
4. AI-modellen ser scaffoldens kod och bygger vidare

## Alla 13 scaffolds

| Scaffold | Målgrupp |
|---|---|
| `landing-page` | Företag, byrå, konsulter |
| `saas-landing` | SaaS med prisplaner |
| `portfolio` | Fotografer, designers |
| `blog` | Bloggar, tidskrifter |
| `ecommerce` | Webshop |
| `dashboard` | Statistik, rapporter |
| `app-shell` | Admin, CRM, verktyg |
| `auth-pages` | Login, registrering |
| `content-site` | Dokumentation, kommun |
| `base-nextjs` | Minimal fallback |
| `restaurant` | Restauranger, caféer, salonger |
| `booking` | Tidsbokning, terapeuter |
| `association` | Föreningar, klubbar, BRF |

## Hur utöka

Skapa en ny mapp `src/lib/gen/scaffolds/<namn>/manifest.ts` med samma structure
som ovan, registrera i `registry.ts`, lägg till nyckelord i `matcher.ts`.

**Kostnad:** ~300 rader kod, ~15 minuter med AI-hjälp.

**Möjliga nya scaffolds baserat på svenska behov:**
- `event` — evenemangssida, konferens, bröllop
- `real-estate` — mäklare, bostadsvisning
- `education` — kursplattform, skola, utbildning
- `healthcare` — vårdcentral, tandläkare (specialisering av booking)
