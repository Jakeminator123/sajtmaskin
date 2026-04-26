# SEO + F3-promotion — exakt spec för nästa PR(s)

**Status 2026-04-26:** ✅ **PR-A klar** (mergad i PR #103) och ✅ **PR-B
klar** (mergad i PR #105 → master `854bb9a31`). Implementationen är
levererad enligt specifikationen nedan. Detta dokument lämnas kvar
som referens för design-besluten + acceptanskriterierna som faktiskt
verifierades i mergad kod.

**Kvar (parkerat, inte aktivt arbete):**
- **Brand-fields UI v2** — `seoBrandSchema` med `companyName`/`tagline`/
  `description`/`locale` finns redan i `preferences-schema.ts`, persisteras
  via API och appliceras av `enrichLayoutMetadata`. Vad som saknas är UI
  i Bygg-dialogen för att låta användaren editera dem. Wire-formatet
  ändras inte när detta läggs till — `SeoOptInPanel` kan utökas i
  bakåtkompatibel takt.
- **Live-smoke polish** — Vercel-preview från PR #105 är skyddad av
  Deployment Protection, så HTTP-smoke kräver bypass-token eller
  `vercel curl`. Det blockerar inte merge men är nyttigt för
  framtida E2E-testning av deploy-routens SEO-svar.
- **Eventuell docs/statusuppdatering** — denna fil + open-threads
  + README är synkade nu (2026-04-26).

---

## Historiska beslut (besvarade vid implementation)

- **Q1 — PR-A före PR-B:** Vald. PR-A (#103) levererade
  `seoPreferencesSchema` + `applyScaffoldSeoDefaults({ siteUrl, brand })`
  + GET/PATCH `/api/projects/[id]/preferences` utan UI. PR-B (#105) la
  till UI + deploy-time-koppling.
- **Q2 — `project_data.meta.seo` (persistens) + deploy-body override:**
  Vald. Server-side precedence: deploy-body > `meta.seo` > env-fallback,
  implementerad i `resolveDeploySeoOptions`.
- **Q3 — Brand auto-fyllning från `chat.meta.brief`:** Skjutet. v1-UI
  exponerar bara `optIn` + `siteUrl`. Brand persisteras via API och
  appliceras av enrich-helpern, men UI för editering är "v2" (se
  parkerat ovan).

---

## PR-A — Backend preferences (utan UI) — ✅ **MERGAD** (PR #103)

### Filer som ska ändras

| Fil | Ändring |
|-----|---------|
| `src/lib/gen/scaffolds/seo-defaults.ts` | Utöka `applyScaffoldSeoDefaults` att ta optional `{ siteUrl?, brand? }`-param. Param overridear env. Behåller helt befintligt env-fallback-beteende när param utelämnad. Exporterar ny helper `getScaffoldSeoDefaultsStatus({ siteUrl, brand })` som tar samma override. |
| `src/app/api/projects/[id]/preferences/route.ts` | Utöka GET/PATCH-schema med `seo: { optIn?, siteUrl?, brand? }`. Persistera under `project_data.meta.seo`. Ingen DB-migration — `meta` är jsonb. |
| `src/lib/projects/preferences-schema.ts` (ny eller utöka befintlig) | Zod-schema för `seoPreferences` så API + framtida UI delar typ. |
| `src/lib/gen/scaffolds/seo-defaults.test.ts` (ny) | Vitest-coverage för opt-in policy + override-paramen. |
| `src/app/api/projects/[id]/preferences/route.test.ts` | Existerande test utökas med GET/PATCH för `seo`-fält. |
| `docs/architecture/scaffold-system.md` | Sektion "SEO defaults" uppdateras med per-projekt-flow. |

### API-fält (preferences)

**GET `/api/projects/:id/preferences` response shape (utökad):**
```jsonc
{
  "preferences": {
    "allowPlaceholdersInF3": false,    // befintlig
    "seo": {                            // NYTT
      "optIn": false,
      "siteUrl": null,
      "brand": null,
      "lastSetAt": null
    }
  }
}
```

**PATCH `/api/projects/:id/preferences` accepterar (alla fält optional):**
```jsonc
{
  "seo": {
    "optIn": true,
    "siteUrl": "https://example.se",
    "brand": {
      "companyName": "...",
      "tagline": "...",
      "description": "...",
      "locale": "sv_SE"
    }
  }
}
```

**Validation-regler:**
- `optIn=true` + `siteUrl=null` → 400 "siteUrl required when SEO opt-in is enabled".
- `siteUrl` måste vara `https://`-prefix + valid hostname (regex eller
  `new URL()`-try).
- `brand.locale` måste vara IETF-formatad (`xx_XX`) — annars 400.

### Är `project_data.meta` rätt val?

**Ja**, av tre skäl:
1. **Ingen DB-migration** — `meta` är `jsonb`, vi lägger bara nya keys.
2. **Konsekvens med befintligt mönster** — `F3PlaceholderToggle` använder
   redan exakt samma flow (`meta.allowPlaceholdersInF3`).
3. **Persistens över sessions** — användaren slipper fylla i samma siteUrl
   vid varje Bygg. Värden förvalfylls i UI.

**Alternativ förkastat:** ren deploy-body (transient) → dålig UX vid
upprepade builds.

### `applyScaffoldSeoDefaults({ siteUrl, brand })` koppling

**Idag (efter PR-A):**
- `seo-defaults.ts` exporterar `applyScaffoldSeoDefaults(scaffold, options?)`.
- `options.siteUrl` overridear env.
- `options.brand` overridear default `title`/`description`/`locale` i
  `enrichLayoutMetadata` + i `OpenGraphImage`-rendering.
- Behavior unchanged om `options` utelämnas → exakt nuvarande env-baserad
  policy.

**Pipeline-koppling sker INTE i PR-A.** Helpern finns och är testad, men
ingen call-site använder param ännu. `registry.ts:70` fortsätter anropa
`applyScaffoldSeoDefaults(scaffold)` utan override → env-fallback. Det
betyder att PR-A är **rent additivt**, ingen befintlig generation
påverkas.

### Acceptanskriterier (PR-A) — alla bockade ✅

- [x] `applyScaffoldSeoDefaults(scaffold, { siteUrl: "https://x.se" })`
      injicerar SEO-filer med "https://x.se" oavsett env.
- [x] `applyScaffoldSeoDefaults(scaffold, { siteUrl: null })` är noop
      även om env är satt (explicit override att stänga av).
- [x] `applyScaffoldSeoDefaults(scaffold)` (ingen options) → identiskt
      beteende som idag (env-baserat).
- [x] `applyScaffoldSeoDefaults(scaffold, { brand })` ersätter `title`,
      `description`, `locale` i layout-metadata.
- [x] `GET /api/projects/:id/preferences` returnerar `seo`-objekt med
      defaults (`optIn:false`, `siteUrl:null`, `brand:null`) för projekt
      som inte satt något än.
- [x] `PATCH /api/projects/:id/preferences` med `seo`-payload persisterar
      i `project_data.meta.seo`.
- [x] `PATCH` med `optIn:true` + `siteUrl:null` → 400.
- [x] `PATCH` med invalid `siteUrl` (ingen `https://`, eller invalid URL)
      → 400.
- [x] Befintliga generation/preview-flöden påverkas inte (regression-test:
      `npm run typecheck` + `npx vitest run src/lib/gen/scaffolds` grönt).

### Tester (PR-A)

- `src/lib/gen/scaffolds/seo-defaults.test.ts` (ny):
  - `applyScaffoldSeoDefaults(scaffold)` → no-op om env unset.
  - `applyScaffoldSeoDefaults(scaffold)` → injicerar med env om satt.
  - `applyScaffoldSeoDefaults(scaffold, { siteUrl: "https://x.se" })` →
    injicerar med x.se oavsett env.
  - `applyScaffoldSeoDefaults(scaffold, { siteUrl: null })` → noop även
    om env satt.
  - `brand`-override syns i `enrichLayoutMetadata`-output.
- `src/app/api/projects/[id]/preferences/route.test.ts` (utöka):
  - GET med projekt utan `seo` → returnerar defaults.
  - PATCH med `seo: { optIn:true, siteUrl:"https://x.se" }` → 200, persisterad.
  - PATCH med `seo: { optIn:true }` (utan siteUrl) → 400.
  - PATCH med `seo: { siteUrl:"http://x.se" }` (icke-https) → 400.

---

## PR-B — UI Bygg-dialog + pipeline-koppling — ✅ **MERGAD** (PR #105 → master `854bb9a31`)

**Levererat med deploy-time injection (Variant B)** — `applySeoToProjectFiles`
extraherades ur scaffold-wrappern och körs i `/api/v0/deployments`-routen
efter `runPreDeployFixPipeline` men före `materializeImagesInTextFiles`.
Ingen LLM-flow-refactor, ingen finalize-runner-ändring.

### Filer som ska ändras

| Fil | Ändring |
|-----|---------|
| `src/components/builder/SeoOptInPanel.tsx` (ny) | Komponent enligt mönster från `F3PlaceholderToggle.tsx`. Checkbox + siteUrl-input + brand-fields (collapsible). |
| `src/components/builder/DeployNameDialog.tsx` | Bädda in `SeoOptInPanel`. Skicka `seo`-state till `onConfirm`. |
| `src/app/builder/useBuilderDeployActions.ts` | `deployActiveVersionToVercel` tar emot `seo`-objekt och skickar med i `/api/v0/deployments`-body. |
| `src/app/api/v0/deployments/route.ts` | Acceptera optional `seo`-fält i body (zod). Skicka vidare till deploy-pipeline. |
| `src/lib/gen/stream/finalize-version/runner.ts` (eller `fast-path.ts`) | När `previewPolicy === "fidelity3"` (eller motsvarande F3-promotion-signal): läs `seo`-options (från body eller `project_data.meta.seo`) → skicka till `applyScaffoldSeoDefaults({ siteUrl, brand })` i scaffold-resolveringen. |
| `src/components/builder/SeoOptInPanel.test.tsx` (ny) | RTL-test för panelen. |
| `src/app/api/v0/deployments/route.test.ts` | Test för `seo`-body-fältet. |
| `src/components/builder/DomainManager.tsx` (lite ändring) | När en domän verifieras → visa "Vill du uppdatera SEO till nya domänen?"-toast med "Update"-knapp som PATCHar `preferences.seo.siteUrl`. (Kan eventuellt skjutas till PR-C för att hålla PR-B liten.) |

### Källa till `seo`-options vid deploy

Två-stegs läsning i `useBuilderDeployActions`:

1. Läs `project_data.meta.seo` via `useProjectPreferences`-hook
   (eller motsvarande).
2. Användaren kan edita i Bygg-dialogen INNAN klick → state hålls lokalt.
3. På "Bygg" → PATCHa preferences (sparar till nästa gång) + skicka
   `seo`-state i deploy-body (omedelbar effekt).

### Acceptanskriterier (PR-B) — levererade ✅

- [x] `DeployNameDialog` visar `SeoOptInPanel` med default OFF.
- [x] PÅ + tom siteUrl → "Publicera"-knappen disabled, inline-fel
      "Ange URL för att aktivera SEO".
- [x] Persisterad domän förvalfyller siteUrl-input via fetch-seed (utan
      att markera dirty — race-condition-fix i commit `a642320d8`).
- [ ] Egen domän verifierad → siteUrl-input förvalt med den. *(parkerat:
      domain-aware auto-fyllning väntar på UX-koppling)*
- [ ] Ingen egen domän + Sajtmaskin-subdomän finns → varning "Pekar mot
      Sajtmaskin-subdomän". *(parkerat: kräver subdomain-resolver)*
- [ ] Brand-fält i UI förvalfyllda från `chat.meta.brief`. *(parkerat
      för v2 — schema/persistens/apply finns, UI saknas)*
- [x] "Publicera" PATCHar `preferences.seo` (best-effort) + POSTar
      `/api/v0/deployments` med `seo`-payload när användaren rört panelen.
- [x] Genererad sajt har `app/robots.ts` med rätt domän + `app/layout.tsx`
      med `metadataBase: new URL(<siteUrl>)` + brand-fallbacks. Verifierat
      av 33 seo-defaults-tester (env-fallback, override, brand, idempotens,
      icke-noll layout-position, src/app/-prefix).
- [x] SEO AV (default) → deploy-filer byte-identiska med innan PR-B
      (explicit-noop-grenen i `applySeoToProjectFiles`).
- [x] Body `siteUrl: null` honoreras som explicit-noop över persisted
      opt-in (commit `5a899ec0b` + 4 regression-tester).

### Tester (PR-B)

- `SeoOptInPanel.test.tsx`:
  - Default OFF, alla SEO-inputs disabled.
  - Toggle ON → siteUrl-input enabled, brand-section expanderad.
  - PÅ + tom siteUrl → onConfirm INTE callbar.
  - Auto-fill från props (egen-domän, brief).
- `DeployNameDialog`-integrationstest:
  - PÅ + brand override → callback får rätt payload.
- `useBuilderDeployActions`:
  - `deployActiveVersionToVercel` med `seo`-state → POST-body innehåller `seo`.
- `/api/v0/deployments/route.test.ts`:
  - Body med `seo` → schema validerar.
  - Body utan `seo` → identiskt beteende som idag.

---

## Leveranshistorik

| PR | Innehåll | Mergad |
|----|----------|--------|
| #102 | Docs/plan/env-policy (denna fil + OPEN-THREADS section 1 + ENV.md + env-policy) | 2026-04-25 |
| #103 | PR-A: backend preferences + `seoPreferencesSchema` + `applyScaffoldSeoDefaults` options-stöd + `applySeoToProjectFiles` extraktion + 30 seo-defaults-tester + 15 preferences-API-tester | 2026-04-25 |
| #105 | PR-B: `SeoOptInPanel` + `DeployNameDialog`-koppling + `useBuilderDeployActions` plumbing + `/api/v0/deployments` SEO-resolver + 12 resolve-seo-tester + 12 SeoOptInPanel-tester + 3 fixar (siteUrl=null explicit-noop, enriched-list-index, persist-fetch race) | 2026-04-26 (master `854bb9a31`) |

**Totalt på master:** 72 SEO-tester gröna, typecheck rent, deploy-time
SEO-injection live.

---

## Kvarvarande arbete (parkerat — startas inte automatiskt)

1. **Brand-fields UI v2.** Lägg `companyName`/`tagline`/`description`/
   `locale`-fält i `SeoOptInPanel` (collapsible). Schema, API-persistens
   och `enrichLayoutMetadata`-applicering finns redan från PR-A. Wire-
   formatet ändras inte → bakåtkompatibelt tillägg.
2. **Live-smoke polish.** Vercel-preview är skyddad av Deployment
   Protection — full E2E-smoke kräver bypass-token eller `vercel curl`.
   Eventuellt skript/runbook för "smoke en preview-deploy med SEO ON +
   verifiera robots.txt/sitemap.xml + opengraph".
3. **Domain-aware auto-fyllning** (om/när det behövs): hämta verifierade
   domäner och Sajtmaskin-subdomän till siteUrl-prefilling med varning
   för subdomain-fallback.
