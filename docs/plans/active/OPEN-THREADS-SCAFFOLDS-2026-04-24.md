# Öppna trådar — scaffolds + SEO + telemetri (2026-04-24)

Saker som flera agentvågor av buggrapporter (SAJ-34 → SAJ-59) genererade
men där fixen kräver antingen produktbeslut, en bredare arbetsspår-design,
eller väntar på data. Punkter sorterade efter typ av blockad.

**Kontext:** denna plan ersätter ingen annan. Den finns för att lösa trådar
inte tappas mellan sessioner. När en punkt adresseras: flytta till `lineage/`
eller bocka av i en commit.

## Kravnivå

- 🟥 **Kräver affärsbeslut** — design/policy som inte ska smygas in.
- 🟧 **Kräver bredare arbetsspår** — heldagsjobb, inte quick fix.
- 🟨 **Väntar på data eller annan tråd** — observation-/dependens-blockerad.

## Snabböversikt

| # | Tråd | Linear | Blockad |
|---|------|--------|---------|
| 1 | SEO-defaults vid fidelity3-promotion | (ny — ej i Linear än) | 🟥 |
| 2 | scaffold-retry saknar brief-context | SAJ-37, SAJ-42 | 🟧 |
| 3 | matcher kwNorm vs matchScaffold ojämn underlag | SAJ-44 | 🟥 |
| 4 | scaffold-scoring wire/keep/delete | SAJ-55 | 🟨 (data) |
| 5 | scaffoldRetryUsed alltid `false` | SAJ-57 | 🟧 + 🟥 |
| 6 | Svensk locale-routing i scaffold-prio | (B2 från ext. modell) | 🟧 |
| 7 | Latency-mätning av site-generation | — | 🟨 (ping från användaren) |

---

## 1. 🟥 SEO-defaults vid fidelity3-promotion (huvudfråga)

### Nuvarande läge (efter commit `ca0ed498f` + `7f07bee86`)

`applyScaffoldSeoDefaults` är nu **opt-in via env**:

- Default (env unset) → `noop`. Inga `app/robots.ts` / `app/sitemap.ts` /
  `app/opengraph-image.tsx` injectas. Layout-metadata enrichas inte. Ingen
  `example.com`-leak möjlig. En `warnLog` syns en gång per process.
- `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL=https://...` satt → full SEO-injektering
  med riktig domän. Robots, sitemap, opengraph-image, samt `metadataBase`,
  `alternates`, `openGraph`, `twitter` i layoutens `metadata`-export.

Detta är en **runtime-toggle på server-process-nivå** — inte en per-projekt
inställning. Det är inte fullt rätt för fidelity3-flödet.

### Vad fidelity3 egentligen är

Lifecycle-stegen idag (förenklat):

1. **Fidelity1/2 (design)** — användaren itererar på look & feel. Preview
   körs i Fly.io. Ingen produktionsdomän finns. SEO är irrelevant.
2. **Fidelity3 (production-export)** — användaren har sagt "skicka till
   produktion". Vercel-projekt skapas, domän kopplas, env-vars synkas.
   Det är NU SEO ska finnas.

Min nuvarande env-flagga är binär per server-process — den fungerar OK för
"sätt SEO_SITE_URL i Vercel-env och alla genereringar i den produktionen
får SEO". Men den är fel modell om:

- Olika användare har olika domäner (multi-tenant) → en process serverar
  flera projekt → en env-flagga räcker inte.
- Samma användare itererar på fidelity2 (utan SEO) och fidelity3 (med SEO)
  i samma session → toggle:n behöver vara per-generation, inte per-process.

### Frågor som måste besvaras

**A) Multi-tenant eller single-tenant?**
- Single-tenant (en domän per Vercel-deploy): nuvarande env-flagga räcker.
  Sätt `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` per Vercel-projekt.
- Multi-tenant: behöver flytta SEO-injektering till en separat fidelity3-pipe
  som tar `siteUrl` per generation (från projekt-record i DB).

**B) Vid VILKEN tidpunkt sätts domänen?**
Två alternativ:
1. **Vid fidelity3-promotion** (när användaren klickar "promote to production"):
   domän måste vara KÄND vid denna tidpunkt. Frågar vi användaren? Använder
   vi en preview-URL som placeholder?
2. **Vid första riktiga deploy** (när Vercel ger oss en URL): SEO injectas
   senare i en separat pipeline-pass efter att deployen är klar och URL
   är fastställd.

Alternativ 2 är cleanare men kräver att SEO-injektering blir en post-deploy
mutation av filerna, inte en del av initial generation.

**C) Hur hanteras "användare har egen domän" vs "Sajtmaskin-subdomän"?**
- Egen domän (`example.com`) → SEO ska peka dit
- Sajtmaskin-subdomän (`projekt-abc123.sajtmaskin.app`) → SEO ska peka dit
  initialt, sedan migrera när användaren kopplar egen domän.

**D) Vad händer med befintliga genereringar utan SEO?**
- Om användaren går från fidelity2 → fidelity3, ska vi re-generera filer
  med SEO inkluderat? Eller bara appendera robots/sitemap till befintliga
  filer?
- Om appendera: vad händer om LLM:en redan emit:at custom robots.ts? Vi
  har idempotens-check (`ensureSeoScaffoldFile` skippar om filen finns) —
  fungerar det vid post-merge?

### Min rekommenderade approach (för dialog)

**Single-tenant först (status quo):** behåll nuvarande env-flagga som
default. Det fungerar för 80%-fallet (en domän per produktion).

**Multi-tenant senare (om/när det blir verkligt):** introducera en
`applyProjectSpecificSeoDefaults(scaffold, { siteUrl, brandName })`-helper
som tar URL per anrop. Den kan köras i en separat fidelity3-pipeline-step
efter `finalize-version` när vi vet projektets domän. Den nuvarande
`applyScaffoldSeoDefaults` blir då en thin wrapper för "global env-fallback".

**Företagsprofil-data:** användarens `brief` har troligen `companyName`,
`tagline` etc. Vi kan utöka SEO-injektering att använda dessa i `title`,
`description`, `openGraph` och i `OpenGraphImage`-renderingen. Det är en
separat förbättring som passar in när vi gör multi-tenant-pivoten.

### Konkreta nästa steg

1. **Beslut A–D ovan** — produktdialog.
2. **Om single-tenant räcker just nu:** dokumentera env-variabeln i
   `docs/ENV.md` + `config/env-policy.json` med exempel.
3. **Om multi-tenant:** skapa Linear-issue "SEO@fidelity3 multi-tenant pipe"
   med design-spec.

---

## 2. 🟧 Scaffold-retry saknar brief-context (SAJ-37 + SAJ-42)

`inferScaffoldRetrySuggestion` använder bara `originalPrompt` när den föreslår
en alternativ scaffold efter preflight-fel. Init-pathen i `orchestrate.ts:467`
använder däremot `matchScaffoldAuto` med `queryContext` (briefPages,
styleKeywords, domainHints) — så retry-förslag baseras på sämre underlag än
init-matchen.

**Fix kräver pipeline-plumbing:** trådra `scaffoldQueryContext` genom
`orchestrate → buildSpec → finalize-version → preflight-phase →
inferScaffoldRetrySuggestion`. Inte en quick fix — flera lager + serialisering.

**Beslut som behövs:** vill vi göra retry-förslagen smartare nu, eller är
heuristisk-retry-systemet (plan L1) som ändå är på väg att ersättas?
Om L1 är nära → skippa SAJ-37/42, fixet blir obsolet.

---

## 3. 🟥 Matcher: kwNorm vs matchScaffold-underlag (SAJ-44)

I `matchScaffoldAuto`:
- `matchScaffold(scaffoldPrompt)` (rad 586) använder prompt+brief.
- `buildKeywordScores(lowerPrompt)` (rad 588) använder bara prompt.
- `applyBriefKeywordBoost` ovanpå ger brief-boost separat.
- `getEmbeddingOverrideReason` (rad 433–491) använder `keywordScores`
  för `kwNorm`, vilket är `prompt + briefBoost` — inte exakt samma underlag
  som `matchScaffold` selekterade på.

Subtle bias i embedding-override-tröskeln för close calls. Inte trasig på
common-case.

**Beslut:** vill vi (a) score:a `selected scaffold` mot exakt samma text
som `matchScaffold` såg, eller (b) explicit separera `user-only diagnostic`
från `override-styrka`? Båda är giltiga, kräver design-call.

---

## 4. 🟨 Scaffold-scoring wire/keep/delete (SAJ-55)

`getScaffoldBoost` + `computeScaffoldScores` har **noll** call-sites idag.
Hela telemetri-baserad scaffold-scoring är ouppkopplad.

**Backoffice-panel finns** (`Scaffold Performance`, commit `24e364b42`)
som visar datan så operatören kan bedöma om scoring är meningsfull.

**Beslutsväntan:** 2–4 veckors data i panelen → välj en av tre vägar:
1. Wire upp i matchern som tie-breaker.
2. Behåll som dashboard-data.
3. Ta bort modulen + DB-kolumnerna.

**Beroende av SAJ-57** — utan retry-tracking är `retryRate` permanent 0
i scoring-formulan, vilket gör vägval 1 omöjligt utan SAJ-57 först.

---

## 5. 🟧 + 🟥 scaffoldRetryUsed alltid `false` (SAJ-57)

`persist-telemetry.ts:178` hardcodar `scaffoldRetryUsed: false`. Konsekvens:
- `getHistoricalRetrySuccess` (SAJ-38) returnerar **alltid `null`**.
- `scaffold-scoring.retryCount` är alltid `0`.

Roten: `persist-telemetry` ser bara den generation som SUGGERAR retry, inte
den nästa generation som ANVÄNDER förslaget. Att silent ändra till
`Boolean(scaffoldRetry)` skulle invertera kolumnens semantik.

**Riktig fix kräver:**
- Upstream chat-repair-pipeline måste flagga "denna generation är ett
  retry-försök efter en suggestion".
- Flagga skickas in som `scaffoldRetryUsed`-param till `persistTelemetryRecord`.
- ALTERNATIVT: nytt schema-fält `parent_telemetry_id` så join kan göras
  retroaktivt.

**Beslut:** vilken approach? Pipe-flagga är minst diskigt, schema är
robustare för retroaktiv analys.

---

## 6. 🟧 Svensk locale-routing i scaffold-prio (B2 från extern modell)

`routePathToScaffoldNeedle` i `scaffolds/serialize.ts` använder första
URL-segmentet som "needle" för att prioritera scaffold-filer. Svenska routes
som `/blogg`, `/butik`, `/kontakt` → needle `blogg`/`butik`/`kontakt` →
matchar inte engelska scaffold-paths (`/blog/`, `/shop/`).

**Fix:** lägg till en sv→en mapping-tabell:
```
/blogg  → blog
/butik  → shop
/kontakt → contact
/om     → about
/tjanster → services
```

**Inte gjort än** för att det egentligen är en del av en bredare
locale-aware routing-feature, inte en lokal scaffold-fix.

---

## 7. 🟨 Latency-mätning av site-generation

Användaren ville mäta var de ~10 minuterna per generation faktiskt går
(LLM-pass, autofix, verifier, Fly.io-deploy etc). `finalizeStepTelemetry`
finns redan — behöver bara ett mätscript.

**Väntar på "ping"** från användaren. När det kommer:
- Skriv `scripts/eval/measure-generation-latency.mjs` som triggrar 3-5
  generationer mot dev-DB.
- Summera per-fas medianer + p95.
- Korrelera med Fly.io-deploy-loggar.
- Föreslå top-3 åtgärder baserat på var tiden faktiskt går.

---

## Linear-status

- **Done (fixade):** SAJ-34, 35, 36, 39, 40, 41, 49, 50, 52, 53, 54, 56, 58, 59 + B1, B3
- **Backlog (öppna):** SAJ-37, 38, 42, 44, 55, 57 (täcks av denna plan)
- **Cancelled:** SAJ-43 (NOT-A-BUG, regression-guard tillagd)
- **Duplicates:** SAJ-46, 47, 48, 51

Detaljerade verifikationer i `lineage/2026-04-24-scaffold-bug-verification.md`.
