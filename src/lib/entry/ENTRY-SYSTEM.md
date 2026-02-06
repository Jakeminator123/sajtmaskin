# Entry System — sajtstudio.se → sajtmaskin

Hanterar URL-parameter-baserade ingångar till Sajtmaskin från externa sajter (främst sajtstudio.se).

## Filer

```
src/lib/entry/
├── use-entry-params.ts   # React hook — läser URL-params, styr flödet
├── entry-token.ts        # Token-hantering (sessionStorage)
├── index.ts              # Exportfil
└── ENTRY-SYSTEM.md       # Denna fil

src/components/modals/
├── entry-modal.tsx        # Modal för wizard/freeform-entry
└── welcome-overlay.tsx    # Välkomst-overlay med företagsnamn + demovideo
```

## Ingångar från sajtstudio.se

### 1. "Utvärdera din sajt" (sajtstudio.se)

```
https://sajtmaskin.vercel.app?mode=audit
```

Audit-sektionen expanderas direkt. Ingen modal.

### 2. "Utvärdera din sajt" med företagsnamn

```
https://sajtmaskin.vercel.app?mode=audit&company=alpha-rekrytering-ab
```

1. **WelcomeOverlay** visas: "Välkommen, Alpha Rekrytering AB"
2. Demovideo (platshållare — byt till riktig video i `welcome-overlay.tsx`)
3. Klick "Fortsätt" → overlay stängs, audit-sektion expanderas

### 3. "Analyserad" med företagsnamn

```
https://sajtmaskin.vercel.app?mode=analyserad&company=mitt-foretag-ab
```

1. **WelcomeOverlay** visas: "Välkommen, Mitt Foretag AB"
2. Klick "Fortsätt" → overlay stängs, AI-wizard öppnas
3. Företagsnamnet är **förifylt** i wizardens steg 1

`analyserad` är ett URL-alias som internt mappar till `wizard`.

### 4. Normal landing (sajtstudio.se "Bygg din sajt nu")

```
https://sajtmaskin.vercel.app
```

Ingen speciell hantering. Normal startsida.

### 5. Token-baserad entry (planerad — sajtstudio.se/start)

```
https://sajtmaskin.vercel.app?token=demo-kzmpc9tk45vsovp4cme1
```

Token sparas i `sessionStorage` under nyckeln `sajtmaskin_entry_token`.
Kan läsas var som helst med `getEntryToken()` från `@/lib/entry`.

Token-format: `demo-` + alfanumerisk sträng.

## URL-parametrar

| Param     | Exempel                    | Effekt                                        |
|-----------|----------------------------|-----------------------------------------------|
| `mode`    | `audit`, `analyserad`, `wizard`, `freeform` | Styr vilken sektion/modal som aktiveras |
| `company` | `alpha-rekrytering-ab`     | Visar WelcomeOverlay + förifyller wizard      |
| `ref`     | `sajtstudio`               | Visar "Via sajtstudio" badge i entry modal    |
| `token`   | `demo-kzmpc9tk45vsovp4cme1`| Sparas i sessionStorage                       |

## Slug-formatering (`company`)

Bindestreck → mellanslag, varje ord kapitaliseras:

```
alpha-rekrytering-ab  →  Alpha Rekrytering AB
stockholms-hb         →  Stockholms HB
mitt-foretag          →  Mitt Foretag
```

Kända förkortningar som versaliseras: **AB, HB, KB, EK, EF**

## Flödeslogik

```
URL-param?  ──────────────────────────────────────────────────┐
                                                              │
  ?mode=audit (utan company)                                  │
    └→ Audit-sektion expanderas direkt                        │
                                                              │
  ?mode=audit + ?company=xxx                                  │
    └→ WelcomeOverlay → Audit-sektion                         │
                                                              │
  ?mode=analyserad (utan company)                             │
    └→ Wizard öppnas direkt                                   │
                                                              │
  ?mode=analyserad + ?company=xxx                             │
    └→ WelcomeOverlay → Wizard (med förifylt företagsnamn)    │
                                                              │
  ?mode=wizard / ?mode=freeform                               │
    └→ EntryModal → respektive sektion                        │
                                                              │
  ?token=demo-xxx                                             │
    └→ Sparas tyst i sessionStorage                           │
```

## Konfiguration

I `use-entry-params.ts`:

- **`VALID_ENTRY_MODES`** — Vilka `?mode=`-värden som accepteras
- **`MODE_ALIASES`** — URL-alias → intern mode (`analyserad` → `wizard`)
- **`DIRECT_MODES`** — Modes som hoppar över EntryModal
- **`UPPERCASE_WORDS`** — Förkortningar som versaliseras i företagsnamn

## Arkitektur

```
sajtstudio.se (Render, Next.js)
├── /                    → Hemsida med CTAs → ?mode=audit
├── /start               → Landningssida → ?token=demo-xxx
├── /sajtmaskin          → Redirect till sajtmaskin.vercel.app
└── /api/landing-events  → Analytics API (SQLite)

sajtmaskin.vercel.app (Vercel, Next.js, DETTA REPO)
├── /                    → Läser ?mode / ?company / ?token vid mount
├── src/lib/entry/       → Isolerad entry-logik
└── src/components/modals/welcome-overlay.tsx
```
