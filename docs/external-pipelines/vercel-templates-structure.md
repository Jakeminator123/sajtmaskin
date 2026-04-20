# Vercel Templates — sidstruktur och extraktionsguide

> **Syfte:** dokumentera hur `vercel.com/templates` är uppbyggd så att vår
> dossier- och scaffold-pipeline (`scripts/dossiers/`) kan skrapa rätt fält
> på rätt sätt och inte förlita sig på taggar i mall-titlar.
>
> **Senast verifierad mot Vercel:** 2026-04-18.

---

## Snabb-orientering

| Fråga | Svar |
|---|---|
| URL för listsidan | `https://vercel.com/templates` |
| URL för enskild mall | `https://vercel.com/templates/<framework>/<slug>` |
| Filter-mekanism | URL-parametrar (`?type=...&framework=...&database=...`) |
| Filterlogik | **AND** mellan kategorier, **OR** inom kategori. Orörda kategorier = "alla värden ingår". |
| Kräver inloggning? | Nej — listsidan + mall-detaljsidor är publika. (Inloggning behövs bara för "Deploy"-knappen.) |
| Antal mallar (apr 2026) | ~419 unika mallar i vårt skrap |

---

## Sidans hierarki

```
/templates                     → listsida med 7 filterkategorier + grid
  ?type=<use-case>             → filter (kan ange flera, OR)
  ?framework=<framework>       → filter
  ?css=<css>                   → filter
  ?database=<database>         → filter
  ?cms=<cms>                   → filter
  ?authentication=<auth>       → filter
  ?experimentation=<exp>       → filter
  ?search=<query>              → fritext-sök

/templates/<framework>/<slug>  → mall-detaljsida
  - Header: namn, beskrivning, Deploy + View Demo
  - Body: README-rendrat innehåll (varierar i längd)
  - Sidopanel: GitHub Repo, License, Use Cases, Stack, Database, CMS, Auth
```

---

## Filterkategorier (URL-paramets)

| Kategori | Param-nyckel | Värdeantal (apr 2026) | Vår användning |
|---|---|---|---|
| Use Case | `type` | 25 | **Primär klassificering** av scaffold/dossier |
| Framework | `framework` | 20 | **Hård filter**: bara `next.js` släpps in |
| CSS | `css` | 9 | Mjuk filter (Tailwind föredras, andra accepteras) |
| Database | `database` | 25 | **Tagg-källa** för dossier-metadata |
| CMS | `cms` | 19 | **Tagg-källa** för dossier-metadata |
| Authentication | `authentication` | 5 | **Tagg-källa** för dossier-metadata |
| Experimentation | `experimentation` | 5 | Sällan relevant — skipas |

### Use Case-värden (alla 25)

| Värde | Vår mappning |
|---|---|
| `Admin Dashboard` | dossier (kategori `ui-data`) |
| `AI` | dossier (kategori `ai`) |
| `Authentication` | dossier (kategori `auth`) |
| `Backend` | **skippa** (server-only, off-scope) |
| `Blog` | dossier (kategori `ui-content`) |
| `CDN` | **skippa** (Vercel-infra, off-scope) |
| `CMS` | dossier (kategori `cms`) |
| `Cron` | **skippa** (off-scope för site-gen) |
| `Documentation` | dossier (kategori `ui-content`) |
| `Ecommerce` | dossier (kategori `payments` eller scaffold) |
| `Edge Config` | **skippa** (Vercel-infra) |
| `Edge Functions` | **skippa** |
| `Edge Middleware` | **skippa** |
| `Marketing Sites` | dossier (kategori `ui-marketing`) |
| `Microfrontends` | **skippa** (avancerad arkitektur) |
| `Monorepos` | **skippa** (vi väljer monorepo-frihet själva) |
| `Multi-Tenant Apps` | dossier (kategori `auth`) |
| `Portfolio` | dossier eller scaffold |
| `Realtime Apps` | dossier (kategori `realtime`) |
| `SaaS` | dossier eller scaffold |
| `Security` | **skippa** |
| **`Starter`** | **scaffold-kandidat** (om compat-test passar) |
| `Vercel Firewall` | **skippa** |
| `Virtual Event` | **skippa** (för smal niche) |
| `Web3` | **skippa** (off-scope) |

---

## Mall-detaljsidans schema

| Fält på sidan | Var det hämtas | Format | Notering |
|---|---|---|---|
| Titel | `h1` i header | Sträng | T.ex. `"Stripe Subscription Starter"` — orden "Starter/Kit/Boilerplate" är ordval, **inte** kategori |
| Kort beskrivning | Under titeln | Sträng | Ofta 1 mening |
| Deploy-knapp | Header höger | Länk till `vercel.com/new/...?template=...` | Inte intressant för extraktion |
| View Demo-knapp | Header höger | Länk till live-deployment | Inte krav men nice-to-have för dossier-metadata |
| Body | Mitten | Markdown (renderad) | **Hela README från GitHub-repot** — den fluktuerande delen |
| GitHub Repo | Sidopanel | `<org>/<repo>` + länk | **Källan vi extraherar från** |
| License | Sidopanel | Länk | Bara MIT/Apache 2 är säkra för oss |
| Use Cases | Sidopanel | Pill-badges | Match mot tabellen ovan |
| Stack | Sidopanel | Pill-badges | T.ex. `[Next.js, Tailwind]` |
| Database | Sidopanel | Pill-badges | T.ex. `[Supabase]` — separat fält, inte i Stack |
| CMS | Sidopanel | Pill-badges | Separat fält |
| Auth | Sidopanel | Pill-badges | Separat fält |

### Kritiska fält som **saknas** på sidan (måste hämtas från GitHub)

| Fält | Varför kritiskt | Källa |
|---|---|---|
| Stack-versioner (Next, React, Tailwind) | Driftrisk mot vår stack-baseline (Next 16) | `package.json` i repo |
| Filträd | Vad scaffolden/dossiern faktiskt innehåller | Repo-clone |
| `package.json` deps | Produktionsberoenden | Repo-clone |
| `.env.example` | Vilka env vars behövs | Repo-clone |
| `archived` flag | Är repot sunset? | GitHub API `repos/<org>/<repo>` |
| `pushed_at` | Hur stale är repot? | GitHub API |
| Topics | Extra taggar | GitHub API |

---

## Två install-mönster (påverkar extraction)

| Mönster | Användning | Exempel | Konsekvens |
|---|---|---|---|
| **Vercel/Next.js subfolder** | Vercel-made mallar | `vercel/next.js#examples/blog-starter` | Måste skrapa subpath, inte hela repot. Versioner finns i mono-repots root. |
| **Community standalone** | Externa författare | `nicoalbanese/pinecone-vercel-starter` | Klona hela repot direkt. Versioner i `package.json` på root. |

### Identifiera vilket mönster

```
Om GitHub Repo === "vercel/next.js":
  → subfolder-mönster, slug = examples/<template-name>
Annars:
  → standalone-mönster, hela repot är mallens kod
```

---

## Health-signaler (måste kontrolleras)

| Signal | Vad det betyder | Var det hämtas |
|---|---|---|
| `[!WARNING]` / `[!NOTE]` admonitioner i README | Mallen ersatt eller deprekierad | Body på Vercels mall-sida + GitHub README |
| `archived: true` (GitHub API) | Repot är arkiverat / read-only | `GET /repos/<org>/<repo>` |
| `pushed_at < (now - 12 mån)` | Stale repo | Samma API-call |
| Last commit-meddelande nämner gammal stack | T.ex. "Next.js 14 SSR" | Repo-history |
| Banner "This repository was archived..." | GitHub UI-banner | Skrapas från repo-sidan |

**Exempel:** Vercels egen `Stripe Subscription Starter` (`vercel/nextjs-subscription-payments`) är **arkiverat på GitHub sedan jan 2025**, men listas fortfarande som aktiv mall på Vercel. Vår pipeline måste själv detektera detta.

---

## Compat-test för scaffold-kandidat

En `type=starter`-mall blir **scaffold** bara om alla nedan stämmer:

| Test | Krav |
|---|---|
| Framework | `Next.js` (badge eller `package.json` `next`-dep) |
| App Router | `app/page.tsx` finns i repot |
| Layout | `app/layout.tsx` finns |
| Stack-version | `next` ≥ `14` |
| Inte cross-platform | Inga deps på `expo`, `react-native`, `solito` |
| Inte arkiverat | GitHub API `archived: false` |
| Inte stale | `pushed_at` ≥ `now − 18 mån` |
| Bredd-relevant | Use Case ⊆ {`Starter`, `SaaS`, `Marketing Sites`, `Portfolio`, `Blog`, `Ecommerce`, `Admin Dashboard`} |

**Om compat-test fail:** mallen flyttas till **dossier-pipeline** istället (förutsatt att den passar någon dossier-kategori) eller skipas helt.

---

## Vår klassificeringsregel (auktoritativ)

```
INPUT: enriched-template (från Vercel-skrapet + GitHub API)

OUT-of-scope tidigt:
  - framework saknar Next.js              → SKIP
  - useCases ∩ SKIP_USE_CASES ≠ ∅          → SKIP
  - GitHub repo archived                   → SKIP (eller flagga sunset-replacement)
  - cross-platform deps                    → SKIP

Klassning:
  - useCases inkluderar "Starter"
    AND compat-test passar                 → SCAFFOLD
  - Stack-fält "Database" populerad        → DOSSIER (kategori: database)
  - Stack-fält "CMS" populerad             → DOSSIER (kategori: cms)
  - Stack-fält "Authentication" populerad  → DOSSIER (kategori: auth)
  - Title/desc nämner stripe/paddle/...    → DOSSIER (kategori: payments)
  - useCases inkluderar "AI"               → DOSSIER (kategori: ai)
  - useCases inkluderar "Realtime Apps"    → DOSSIER (kategori: realtime)
  - useCases inkluderar "Blog"/"Documentation" → DOSSIER (kategori: ui-content)
  - useCases inkluderar "Admin Dashboard"  → DOSSIER (kategori: ui-data)
  - useCases inkluderar "Marketing Sites"/"Portfolio" → DOSSIER (kategori: ui-marketing)
  - "Starter" som inte klarade compat-test → DOSSIER om någon kategori träffar, annars SKIP
  - Inget träffar                          → SKIP
```

---

## Filter-URL-exempel

```
Alla Next.js-starters:
  /templates?type=starter&framework=next.js

Alla Next.js+SaaS+Multi-Tenant:
  /templates?type=saas&type=multi-tenant-apps&framework=next.js

Alla Next.js med Supabase:
  /templates?framework=next.js&database=supabase

Sökning:
  /templates?search=stripe
```

---

## Ändringslogg

| Datum | Ändring |
|---|---|
| 2026-04-18 | Skapad. Dokumenterar nuvarande sidstruktur (apr 2026) som grund för dossier-pipeline-omarbetningen. |
