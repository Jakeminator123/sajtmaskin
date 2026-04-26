# Öppna trådar — scaffolds + SEO + telemetri (2026-04-24)

**Status 2026-04-26 (sen):** ✅ SEO-spåret är klart. PR #102 (docs/plan)
+ PR #103 (PR-A backend) + PR #105 (PR-B UI + deploy-time injection)
mergade. Master `854bb9a31`. Kvar parkerat: brand-fields UI v2 +
live-smoke polish — se `SEO-F3-PROMOTION-NEXT-PR.md` "Kvarvarande
arbete". Övriga trådar (2–7) status oförändrad.

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
| 1 | SEO-defaults vid fidelity3-promotion | (ny — ej i Linear än) | ✅ KLAR — PR #102 (docs) + #103 (PR-A) + #105 (PR-B). Kvar parkerat: brand-UI v2 + live-smoke polish. |
| 2 | scaffold-retry saknar brief-context | SAJ-37, SAJ-42 | 🟧 |
| 3 | matcher kwNorm vs matchScaffold ojämn underlag | SAJ-44 | 🟥 |
| 4 | scaffold-scoring wire/keep/delete | SAJ-55 | 🟨 (data) |
| 5 | scaffoldRetryUsed alltid `false` | SAJ-57 | 🟧 + 🟥 |
| 6 | Svensk locale-routing i scaffold-prio | (B2 från ext. modell) | 🟧 |
| 7 | Latency-mätning av site-generation | — | 🟨 (ping från användaren) |

---

## 1. ✅ SEO-defaults vid fidelity3-promotion (huvudfråga) — LEVERERAD

**Status 2026-04-26:** Klar.

- **PR #102** (docs/plan) — env-policy, OPEN-THREADS sektion 1,
  `SEO-F3-PROMOTION-NEXT-PR.md`.
- **PR #103** (PR-A backend) — `seoPreferencesSchema`,
  `applyScaffoldSeoDefaults({ siteUrl, brand })`, `applySeoToProjectFiles`-
  extraktion, GET/PATCH `/api/projects/[id]/preferences` med `seo`-fält,
  persistens i `project_data.meta.seo`.
- **PR #105** (PR-B UI + pipeline) — `SeoOptInPanel` i Bygg-dialogen,
  `useBuilderDeployActions` plumbar `seo` i deploy-body, deploy-time
  SEO-injection i `/api/v0/deployments` med precedence body > meta > env.
  Inkluderar 3 fixar (siteUrl=null explicit-noop, enriched-list-index,
  persist-fetch race) och totalt 72 gröna SEO-tester på master
  (`854bb9a31`).

**Kvar parkerat (inte aktivt arbete):** brand-fields UI v2 + live-smoke
polish — se `SEO-F3-PROMOTION-NEXT-PR.md` sektionen "Kvarvarande
arbete".

**Historik nedan bevarad** för framtida referens om varför designen blev
som den blev.

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

### Beslutad approach (2026-04-25)

**Bygg / Fidelity 3-promotion = aktiveringspunkten för SEO.** SEO ska
ALDRIG injectas i Fidelity 1/2 / design-preview — bara när användaren
aktivt promotear till produktion.

**Den nuvarande env-flaggan `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` kvarstår
som global/per-process fallback** för single-tenant Vercel-deploys
(t.ex. om man kör en dedikerad Vercel-instans per kund). Den är
DOKUMENTERAD i `docs/ENV.md` + `config/env-policy.json` (klart
2026-04-25). Den ska INTE sättas i dev / F1 / F2.

**Per-projekt/per-generation siteUrl byggs som nästa steg:** flow
beskrivet under "Bygg-dialog UX" nedan. Specifik PR-spec i separat fil:
`docs/plans/active/SEO-F3-PROMOTION-NEXT-PR.md`.

### Bygg-dialog UX (planerad — ej implementerad än)

När användaren klickar **Bygg** (`onDeployProduction` → `handleOpenDeployDialog`
i `useBuilderDeployActions.ts`) ska `DeployNameDialog` utökas med:

```
[ Deploy-namn-input — befintlig ]

▸ SEO-paket (valfritt)
  ☐ Inkludera robots, sitemap, Open Graph och metadata

  Om PÅ:
  Domän:    [_________________________]
            (förvalt: egen domän om kopplad,
             annars Sajtmaskin-subdomän,
             annars manuellt)

  Brand-data (auto-fyllt från brief, redigerbart):
  Företagsnamn:  [_____________]
  Tagline:       [_____________]
  Beskrivning:   [_____________]
  Locale:        [sv_SE / en_US / …]

[Avbryt]  [Bygg]
```

**Beteende:**

- **Default OFF** — användaren måste aktivt välja in. Eliminerar
  oavsiktlig leak av Sajtmaskin-subdomän som canonical URL i sökmotorer.
- **Domän-auto-fyll-prioritet:**
  1. Egen domän om `domains`-tabellen har en `verified=true`-rad för
     projektet → använd den.
  2. Annars: Sajtmaskin-subdomän (`<projektnamn>.sajtmaskin.app`) → varna
     att SEO då pekar mot subdomänen och måste uppdateras vid kopplad
     domän.
  3. Annars: tom input — användaren måste fylla i för att kunna fortsätta
     med SEO PÅ.
- **Brand-data hämtas från `chat.meta.brief.companyName/tagline/description`
  + `brief.locale`** om tillgängligt. Användaren kan editera och spara.
- **Persisteras i `project_data.meta`** (jsonb, ingen DB-migration):
  ```json
  {
    "seo": {
      "optIn": true,
      "siteUrl": "https://kundens-domän.se",
      "brand": {
        "companyName": "Kunden AB",
        "tagline": "Sveriges bästa exempel",
        "description": "...",
        "locale": "sv_SE"
      },
      "lastSetAt": "2026-04-25T..."
    }
  }
  ```

### Vad händer om domän saknas

- **SEO PÅ + tom siteUrl-input** → Bygg-knappen disabled tills användaren
  fyller i, ELLER togglar SEO av.
- **SEO PÅ + Sajtmaskin-subdomän vald** → bygget går igenom, men UI
  visar gul varning: "SEO pekar mot Sajtmaskin-subdomänen. Uppdatera vid
  kopplad domän." En framtida `DomainManager`-koppling kan automatiskt
  trigga `seo.siteUrl`-uppdatering.
- **SEO AV** → ingen siteUrl behövs. Pipen kör `applyScaffoldSeoDefaults`
  utan override → faller tillbaka till env-flaggan → om env också unset
  → noop. Inga SEO-filer.

### Vad händer om användaren senare kopplar egen domän

**Två scenarier:**

1. **SEO redan injicerat med Sajtmaskin-subdomän:** filerna ligger nu
   i deployen med fel canonical URL. Lösning: när en domän verifieras
   via `DomainManager`, fråga användaren "Vill du uppdatera SEO-paketet
   till nya domänen?" → om ja, kör en re-generation eller post-deploy
   patch (utanför scope för denna PR).
2. **SEO inte injicerat:** trivialt — vid nästa Bygg, är egen domän nu
   default i input.

Båda scenarierna täcks INTE av denna första PR. De är uppföljnings-PRs
när Bygg-flödet är på plats och vi kan se faktiska användarmönster.

### Konkret implementations-spec

Se `docs/plans/active/SEO-F3-PROMOTION-NEXT-PR.md` för exakt vilka filer
som ändras, API-fält, acceptanskriterier och tester.

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
