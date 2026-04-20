# Dossier-format

**Status:** Format v1.1, uppdaterat 2026-04-17. Source of truth för struktur. Schema-fil: `docs/schemas/strict/dossier.schema.json`.

> **Vad är en dossier?** En dossier (mapp som beskriver en återanvändbar funktion eller ett byggblock + den kod som behövs för att implementera den) är en **scaffold-agnostisk** legokloss. En blog-scaffold kan plocka in en `payments-stripe-checkout`-dossier på samma sätt som en dashboard-scaffold gör. Tillsammans utgör scaffolden + de valda dossiernas innehåll det LLM:en bygger användarens sajt från.
>
> **Pool-modellen:** Alla dossiers är tillgängliga för alla scaffolds. `scaffoldFit` är **rankings-hint** för embedding-sökning, inte hård filter. Vilka som faktiskt _rekommenderas_ per scaffold styrs av en separat fil (`data/dossiers/_index/scaffold-recommendations.json`) som du kan möblera om utan att röra dossier-manifesten.

## Två klasser av dossiers

| Klass | Vad det är | Exempel-id:n |
|---|---|---|
| **Integration** (`integration`) | Komponenter + env vars + LLM-instruktion för en specifik tredjepartstjänst | `payments-stripe-checkout`, `auth-clerk`, `auth-nextauth-credentials`, `cms-sanity`, `cms-payload`, `realtime-liveblocks`, `bookings-cal-com`, `email-resend`, `analytics-vercel`, `ai-chat-streaming`, `ai-rag-pinecone` |
| **UI-section** (`ui-section`) | Komponent + sektionsmönster utan extern provider | `pricing-tier-table`, `testimonial-carousel`, `feature-grid`, `cta-banner`, `analytics-dashboard-widget`, `hero-with-video`, `faq-accordion` |

## Mappstruktur

```
data/dossiers/
  <category>-<provider-or-pattern>/                    # ex: payments-stripe-checkout
    manifest.json                                      # OBLIGATORISK
    instructions.md                                    # OBLIGATORISK
    components/                                        # OBLIGATORISK om dossier har TSX
      <component-name>.tsx
      api/<route-name>/route.ts                        # om server-side krävs
    .env.example                                       # OBLIGATORISK om envVars finns
    examples/                                          # OPTIONAL — fullständigt exempel
      page.tsx
```

## `manifest.json` — schema

```json
{
  "$schema": "../../docs/schemas/strict/dossier.schema.json",
  "id": "payments-stripe-checkout",
  "kind": "integration",
  "category": "payments",
  "label": "Stripe Checkout",
  "description": "One-line product description",
  "summary": "1-3 sentences: what the dossier does, when LLM should use it, key UX choices.",
  "providers": [{ "name": "Stripe", "url": "https://stripe.com" }],
  "envVars": [
    { "key": "STRIPE_SECRET_KEY", "required": true, "purpose": "Server-side Stripe API auth" },
    { "key": "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "required": true, "purpose": "Client-side Stripe.js init" }
  ],
  "dependencies": ["stripe", "@stripe/stripe-js"],
  "files": [
    { "path": "components/checkout-button.tsx", "role": "client", "kind": "component" },
    { "path": "components/api/checkout-session/route.ts", "role": "server", "kind": "api-route" }
  ],
  "exposes": [
    { "name": "CheckoutButton", "type": "component", "import": "@/components/checkout-button" }
  ],
  "scaffoldFit": {
    "primary": ["ecommerce", "saas-landing"],
    "compatible": ["landing-page", "content-site", "blog", "portfolio"]
  },
  "_source": "hand-curated",
  "complexity": "medium",
  "qualityScore": 95,
  "sourceTemplateUrl": "https://vercel.com/templates/ecommerce/stripe-subscription-starter",
  "sourceRepoUrl": "https://github.com/vercel/exempel-repo",
  "lastVerified": "2026-04-17",
  "tags": ["payments", "checkout", "stripe", "subscription"]
}
```

### Fältförklaringar

| Fält | Krav | Vad det är |
|---|---|---|
| `id` | obligatorisk | Kebab-case, måste matcha mappnamnet |
| `kind` | obligatorisk | `integration` eller `ui-section` |
| `category` | obligatorisk | En av: `payments`, `auth`, `database`, `cms`, `realtime`, `bookings`, `email`, `analytics`, `ai`, `ui-content`, `ui-data`, `ui-marketing` |
| `label` | obligatorisk | Mänskligt namn för backoffice-listning |
| `description` | obligatorisk | En rad. För kort manifest-listning. |
| `summary` | obligatorisk | 1-3 meningar. Används som embedding-källa + i prompt. |
| `providers` | optional | Externa tjänster. Tomt för UI-sections. |
| `envVars` | optional | Lista av `{key, required, purpose}`. Tomt om dossier inte behöver env. |
| `dependencies` | obligatorisk (kan vara tom array) | npm-paket som måste läggas till i `package.json` |
| `files` | obligatorisk | Lista av filer i `components/` med `role` (`client`/`server`) och `kind` (`component`/`api-route`/`hook`/`util`/`config`) |
| `exposes` | optional | Vilka named exports/components LLM kan importera |
| `scaffoldFit` | obligatorisk | `primary` = bästa fit (boostas i embedding-rankning), `compatible` = funkar bra. **Inte** ett hård-filter — alla scaffolds kan plocka alla dossiers. Faktiska rekommendationer per scaffold ligger i `_index/scaffold-recommendations.json`. |
| `_source` | obligatorisk | Var datan kom ifrån: `hand-curated`, `vercel-light-catalog`, `shadcn-blocks`, `manual-import`, etc. Används för spårning. |
| `complexity` | obligatorisk | `simple` (1-2 filer) / `medium` (3-5 filer + env) / `advanced` (>5 filer eller multi-step) |
| `qualityScore` | optional | 0-100. Sätt 90+ för Vercel-officiella, lägre för externa. |
| `sourceTemplateUrl` | optional | Länk till Vercel-template-sidan |
| `sourceRepoUrl` | optional | GitHub-repo källan kommer ifrån |
| `lastVerified` | obligatorisk | ISO-datum för senast manuell verifiering |
| `tags` | obligatorisk | Lågfrekvent fritext för backoffice-filtrering |

## `instructions.md` — vad LLM:en läser

Markdown-fil som LLM:en får direkt i system-prompten när dossiern matchas. Format:

```markdown
# When to use

[1-3 punkter där dossiern är rätt val]

# How to integrate

1. [Steg 1 — exakt: import, env, mount-plats]
2. [Steg 2]
3. [Steg 3]

# UX rules

- [Regel om feedback, validering, fallback-state]
- [Regel om mobilbeteende]

# Avoid

- [Vad LLM:en inte ska göra trots att det vore "naturligt"]

# Verification

- [Manuella check-punkter användaren kan testa]
```

Instructions ska vara **konkreta** och **scaffold-agnostiska** (gäller oavsett vilken scaffold användaren har).

## Embedding-strategi

| Källa | Vad embedas | Var |
|---|---|---|
| Per dossier | `${label}\n${summary}\n${tags.join(' ')}` | `data/dossiers/_index/dossier-embeddings.json` |

Vid runtime: prompt + brief + scaffold-context → vector → cosine search mot dossier-embeddings → top N (per category, dedup) → injicera valda dossiers i system-prompten.

## Kuration (`_index/`)

```
data/dossiers/_index/
  master.json                             # alla manifests aggregerade (för backoffice + runtime)
  by-category.json                        # { "payments": ["payments-stripe-checkout"], ... }
  dossier-embeddings.json                 # alla dossiers, en vektor per
  scaffold-recommendations.json           # vilka dossiers en scaffold rekommenderar
  curation-log.md                         # mänsklig logg över vad vi tagit in/avvisat och varför
```

`master.json` är den enskilda fil som **backoffice + runtime** läser för att veta vilka dossiers som finns. Genereras av `scripts/dossiers/build-dossier-index.ts`.

### `scaffold-recommendations.json` — möblerbart register

Schema:

```json
{
  "generatedAt": "2026-04-17T...",
  "scaffolds": {
    "<scaffold-id>": {
      "alwaysInclude": ["<dossier-id>"],
      "primaryRecommended": ["<dossier-id>"],
      "suggested": ["<dossier-id>"]
    }
  }
}
```

| Tier | Vad det betyder vid runtime |
|---|---|
| `alwaysInclude` | Dossiern injiceras i system-prompten oavsett vad användarens prompt säger. Använd sparsamt — bara för funktioner som varje sajt i den scaffolden vill ha (sällsynt). |
| `primaryRecommended` | Embedding-rankning får +0.15 boost. Visas högst i förslagslistan. |
| `suggested` | Embedding-rankning får +0.05 boost. Sekundär förslagslista. |

Genereras initialt av `scripts/dossiers/build-scaffold-recommendations.ts` baserat på dossiers' `scaffoldFit`. **Skriptet skriver bara om filen om du explicit kör med `--force`.** Annars är filen din att möblera om utan att skript skriver över.

## Rules för agenter och människor

1. **Aldrig hand-edita `_index/`-filer** — regenereras alltid från `manifest.json` per dossier.
2. **`instructions.md` ska vara scaffold-agnostisk.** Säg inte "om du använder app-shell". Säg "om scaffolden har sidebar".
3. **`components/` ska vara körbar TSX/TS som funkar ensam** (förutsatt att `dependencies` installerats och `envVars` finns).
4. **`lastVerified` uppdateras varje gång dossiern hand-redigeras** — annars vet vi inte om koden är aktuell.
5. **Hand-kuraterade dossiers har prioritet över skrapade.** En `qualityScore: 95` med `lastVerified` < 6 månader rankas före en `qualityScore: 90` med äldre verifiering.

## Lifecycle-fält (`_status`, `_curatedAt`, `_curatedBy`)

| Fält | När sätts | Vem skriver |
|---|---|---|
| `_status: "draft"` | När `promote-skiss-to-dossier.ts` skapar mappen från en skiss | promotion-skript |
| `_extractedAt`, `_extractedFromCache`, `_envExampleCopied` | Efter `extract-files-from-cache.ts` har plockat filer från `_repo-cache/` | extract-skript |
| `_status: "active"` + `_curatedAt` + `_curatedBy: "auto-curate.ts"` | Efter LLM-kurering (eller hand-kurering där `_curatedBy: "hand"`) | kurator |

Endast `_status: "active"` dossiers exponeras i runtime — `master.json` har båda men `by-category.json` filtrerar till active.

### Skelett-drafts (utan filer) städas normalt

Drafts som bara består av en stomme (manifest med `files: []`, okurerad `instructions.md` med `_Curator: replace` -platshållare, ingen `components/`-mapp) är **scrape-skelett som väntar på pipelinen**. De når aldrig runtime — `getActiveDossiers()` filtrerar bort dem — men de tar plats på disk och visas missvisande i `scaffold-recommendations.json`. Kommandot för att ta tillbaka dem till liv:

```bash
npm run dossiers:clone-repos     # klona Vercel-repots filer till _repo-cache/
npm run dossiers:extract-files   # plocka relevanta files till data/dossiers/<id>/components/
npm run dossiers:curate          # LLM skriver instructions + flippar _status: "active"
npm run dossiers:rebuild         # bygger om master + recommendations + embeddings
```

Om en draft inte är värd pipelinen är det säkert att radera mappen helt — den kan alltid scrape:as om från Vercel-katalogen via `npm run dossiers:scrape`.

## AI-kurering (`scripts/dossiers/auto-curate.ts`)

GPT-5.4 kan ta en draft (post-extraktion) → produktionsklar dossier:

- Läser `manifest.json` + alla filer i `components/` + `.env.example`.
- Strukturerat output (Zod-schema) producerar: `summary`, `providerName`, per-fil `keep|remove`-beslut + reason, lista av filer att skapa (ofta saknas t.ex. `middleware.ts`), full `instructions.md` (When to use / How to integrate / UX rules / Avoid / Verification), `tags`, `qualityScore`, `complexity`, `scaffoldFit`.
- Filer markerade `remove` flyttas till `_removed/<path>` (rollback-säkerhetsnät, *INTE* raderas).
- Filer i `filesToCreate` skrivs som **generiska** (inga template-imports, inga template-färger).
- Sätter `_status: "active"`, `_curatedBy: "auto-curate.ts"`, `_curatedAt`-timestamp.
- Rensar draft-markörer (`_extractedAt`, `_extractedFromCache`, `_envExampleCopied`).

Användning:

```bash
npx tsx scripts/dossiers/auto-curate.ts --dry-run --only=<id>   # förhandsgranska
npm run dossiers:curate -- --only=<id>                          # en dossier
npm run dossiers:curate                                          # alla drafts (~12 min)
npm run dossiers:curate -- --force --only=<id>                   # re-kurera aktiv
```

**Manuell granskning rekommenderas efter AI-kurering** för kritiska integrationer (auth, payments). Hand-kuraterade dossiers (`_curatedBy: "hand"`) behåller alltid prio över AI-kuraterade vid konflikt.

## Verkliga exempel — se

- `data/dossiers/payments-stripe-checkout/` (integration)
- `data/dossiers/ui-pricing-tier-table/` (ui-section)

## Hänvisningar

- Pipeline + lane-karta: `docs/architecture/dossier-pipeline-roadmap.md`
- Scaffold-systemet (inventarium + arkitektur): `docs/architecture/scaffold-system.md`
- Scaffold-kontrakt (rent schema): `docs/schemas/scaffold-contract.md`
