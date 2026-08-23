# Scaffoldmatris — baslinje 2026-08-21

Ögonblicksbild av scaffold-/variant-/mall-/addendumkedjan **före**
initiativet [`docs/plans/avklarat/2026-08-21-scaffold-komposition-och-stad/`](docs/plans/avklarat/2026-08-21-scaffold-komposition-och-stad/00-master-plan.md).
Syfte: jämförelsepunkt när K1–K5 är levererade — mät om mot samma kolumner och
se vad som faktiskt förbättrades. Analysbas: `master` @ `0c13d9226`,
prod-telemetri (`generation_telemetry`) 11–19 aug 2026.

## Matris

| Scaffold | Intention | Hero/skal i fil (baslinje) | Varianter | Verklig kompositionsvariation? | Prod preview-OK | Betyg (1–5) |
|---|---|---|---|---|---|---|
| `landing-page` | Lokal/tjänst/kampanj, one-page | 60/40 split: text vänster + Card höger (`page.tsx:29`) | 10 | Nej — 6/10 beskriver själva splitten; `hero-fullbleed-bg` + `asymmetric-stack` bryter, men bara i prompt | 98 % (48 gens) | 3 |
| `saas-landing` | B2B-produkt, pricing/FAQ | 60/40 split; manifestet befaller höger produktkort (`page.tsx:50`) | 2 | Nej — båda varianterna är 2-kolumn | 100 % (3) | 3 |
| `portfolio` | Person/studio showcase | 50/50 split ×2 (`page.tsx:44,99`); ingen header | 2 | Nej — default är split; `showcase-bold` vill cinematic utan filstöd | 100 % (4) | 3 |
| `blog` | Redaktion, artiklar | Kort-grid, ingen split-hero; riktiga routes (`/blog`, `/blog/[slug]`) | 2 | Variant-text ≠ fil (lässpalt vs kortsida) | 100 % (8) | 3 |
| `ecommerce` | Storefront + cart | Centrerad hero utan bild; riktig sidgraf (6 routes) | 3 | JSON beskriver 3 olika sajter, filen är en | 100 % (2) | 4 |
| `app-shell` | Operativt skal: sidebar, köer, tasks | Inget hero: `h-screen`-skal + sidebar + 4 KPI + kö-tabell | 3 | Komposition i prompt, filer oförändrade | **0 % (5)** | 4 |
| `dashboard` | Analytics-cockpit | Samma skal, tunnare home; `/analytics` med trend/kanaler | 2 | Komposition i prompt | 60 % (5) | 4 |
| `projekt-bas-app` | Scaffold: Av-baslinje | Centrerad H1, avsiktligt tom | 1 | «håll det tomt» | 71 % (7) | 2 |
| `base-nextjs` | Minimal webb-starter | «Välkommen» + 3 feature-kort; varianter beskriver top bar som inte finns i fil | 4 | Nej | – | 2 |
| `auth-pages` | Login/signup/reset | Centrerat kort; login/signup/forgot länkade | 2 | Nej — varianter vill split-screen utan filstöd | – | 3 |

Gemensamt för alla (baslinjen): `Inter`, primary `oklch(0.58 0.16 258)`,
`max-w-6xl`, nära copy-paste-footers med `href="#"` i landing/saas/portfolio/blog.

## De fem orsakerna till likformig webboutput (baslinjen)

1. **Filerna är mönstret:** tre scaffolds hårdkodar samma split-hero
   (`landing-page:29`, `saas-landing:50`, `portfolio:44,99`).
2. **Varianter muterar aldrig filer** — bara tokens/promptrader; defaults
   (`corporate-grid`, `friendly-saas`, `minimal-studio`) kodifierar splitten.
3. **Variantinspirationen är init-only** (`finalize-prompts.ts`) och layouts
   når inte vanliga follow-ups (compact-blocket) — första kompositionen
   låses av follow-up-frysen. `clear-redesign` får layouts men inte
   stillbild/utdrag.
4. **Addendumens förstaval var generiska pro-blocks-kit** (kurering påbörjad
   i #1090; Brief-rankning i #1087).
5. **Gemensam chrome/tokens** + budgetprio: addendum (84) och UI Recipes (80)
   prunas före required scaffold/variant/brief (90–94).

## Kedje-/städfynd (baslinjen)

| Yta | Läge 2026-08-21 | Åtgärd |
|---|---|---|
| `scaffold-scoring.ts` | Död (0 anropare), knip-skyddad | K4 raderar |
| Research-merge `registry.ts:82–98` | Legacy template-library-overrides | K4 utreder/städar |
| Manifest-`tags` | Bara embeddings; matchern har egna keyword-banks | K4 dokumenterar |
| Dubbel variant-pick (sync/async/style-pin) | Tre ingångar | K4 dokumenterar |
| Addenda-register | 69 poster; kurering + Brief-rank i konflikt (#1087/#1090) | K1 förenar |
| Next-version | Centralt ägd i `project-scaffold.ts` | #1084 uppdaterar pinnen |
| `app-shell` preview | **0 % OK (5/5 fail)** | Buggkö (K5 loggar) |

## Så jämför vi efteråt

När K1–K5 är mergade: gör om samma mätning (läsagenter på matriskolumnerna +
telemetrifråga per scaffold_id + variant-läsning) och ställ mot denna fil.
Förväntad förändring: kolumn «Hero i fil» olika per webbscaffold, kolumn
«Kompositionsvariation» ja för minst en variant per scaffold, städraderna
gröna. Uppdatera inte denna fil — skriv en ny daterad jämförelse bredvid, eller
lägg utfallet i initiativets master plan.
