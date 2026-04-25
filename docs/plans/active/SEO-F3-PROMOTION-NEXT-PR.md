# SEO + F3-promotion — exakt spec för nästa PR(s)

**Bransch (denna PR — bara dokumentation):** `seo-f3-promotion-ux`
**Status:** specifikation klar, väntar på godkännande av implementationsordning.

Denna fil är **planeringsdokument**, inte kod. Implementeras som **två
separata PRs** (B + UI) eller **en sammanslagen PR**, beroende på vad
användaren väljer efter dialog. Det enda som är klart i `seo-f3-promotion-ux`-
branchen idag är dokumentation (env-doc + open-threads-uppdatering + denna
fil).

---

## Beslut som krävs INNAN implementation

**Q1.** Vill du köra **PR-A först (backend-preferences)** så pipen är
färdig att ta emot per-projekt-data, och sen PR-B (UI) i en andra runda?
Eller hellre **PR-AB samlad** (atomic, men större)?

**Q2.** Är `project_data.meta.seo`-strukturen (jsonb) acceptabel? Eller
ska vi ha det i deploy-body **enbart** (transient, inte persisterat)?
- **`meta.seo` (persisterat):** användaren slipper fylla i samma siteUrl
  vid varje Bygg. UI laddar förvalda värden.
- **Bara deploy-body (transient):** simpelt, men dålig UX om man bygger
  flera versioner — måste fylla i varje gång.
- **Min rekommendation:** `meta.seo` persistens + deploy-body kan
  override:a för "engångsbygge med annan domän".

**Q3.** Brand-overrides — ska de auto-fyllas från `chat.meta.brief` vid
PR-AB, eller är det acceptabelt att UI visar tomma fält tills användaren
fyller i? Auto-fyll är bättre UX men kräver brief-läsning i komponenten.

---

## PR-A — Backend preferences (utan UI)

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

### Acceptanskriterier (PR-A)

- [ ] `applyScaffoldSeoDefaults(scaffold, { siteUrl: "https://x.se" })`
      injicerar SEO-filer med "https://x.se" oavsett env.
- [ ] `applyScaffoldSeoDefaults(scaffold, { siteUrl: null })` är noop
      även om env är satt (explicit override att stänga av).
- [ ] `applyScaffoldSeoDefaults(scaffold)` (ingen options) → identiskt
      beteende som idag (env-baserat).
- [ ] `applyScaffoldSeoDefaults(scaffold, { brand })` ersätter `title`,
      `description`, `locale` i layout-metadata.
- [ ] `GET /api/projects/:id/preferences` returnerar `seo`-objekt med
      defaults (`optIn:false`, `siteUrl:null`, `brand:null`) för projekt
      som inte satt något än.
- [ ] `PATCH /api/projects/:id/preferences` med `seo`-payload persisterar
      i `project_data.meta.seo`.
- [ ] `PATCH` med `optIn:true` + `siteUrl:null` → 400.
- [ ] `PATCH` med invalid `siteUrl` (ingen `https://`, eller invalid URL)
      → 400.
- [ ] Befintliga generation/preview-flöden påverkas inte (regression-test:
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

## PR-B — UI Bygg-dialog + pipeline-koppling

**Förutsätter PR-A är mergad.** Ingen DB-migration. Ingen LLM-flow-refactor.

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

### Acceptanskriterier (PR-B)

- [ ] `DeployNameDialog` visar `SeoOptInPanel` med default OFF.
- [ ] PÅ + tom siteUrl → "Bygg"-knappen disabled, inline-fel "Domän krävs".
- [ ] Egen domän verifierad → siteUrl-input förvalt med den.
- [ ] Ingen egen domän + Sajtmaskin-subdomän finns → siteUrl-input förvalt
      med subdomänen + gul varning "Pekar mot Sajtmaskin-subdomän".
- [ ] Brand-fält förvalfyllda från `chat.meta.brief` (om tillgängligt).
- [ ] "Bygg" PATCHar `preferences.seo` + POSTar `/api/v0/deployments`
      med `seo`-payload.
- [ ] Genererad sajt har `app/robots.ts` med rätt domän, `app/layout.tsx`
      har `metadataBase: new URL(<siteUrl>)`, `title: <brand.companyName>`.
- [ ] SEO AV (default) → ingen `app/robots.ts` etc i deploy. Verifierat
      genom snapshot-test mot Vercel-projekt-filer.

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

## Vad denna PR (`seo-f3-promotion-ux` branch idag) levererar

**Bara dokumentation** — ingen kod. Konkret:

1. `docs/ENV.md` — `SAJTMASKIN_SCAFFOLD_SEO_SITE_URL` dokumenterad i
   "Vanliga tillägg"-tabellen med opt-in-semantik + F3-disclaimer.
2. `config/env-policy.json` — env-keyn lagd i både `knownEmptyOk` och
   `entries` med klassificering `optional_runtime` + notes som varnar mot
   F1/F2-användning.
3. `docs/plans/active/OPEN-THREADS-SCAFFOLDS-2026-04-24.md` — sektion 1
   uppdaterad med beslutad approach (Bygg = aktiveringspunkt) + komplett
   UX-beskrivning + edge-cases (saknad domän, senare kopplad domän).
4. `docs/plans/active/SEO-F3-PROMOTION-NEXT-PR.md` — denna fil. Exakt
   spec för PR-A och PR-B.
5. `docs/plans/active/README.md` — router-tabellens M-rad uppdateras med
   pekare till denna spec-fil.

**Inget av följande:**

- Ingen ändring i `applyScaffoldSeoDefaults`-funktionssignaturen.
- Ingen ny komponent eller UI-ändring.
- Ingen `preferences`-API-ändring.
- Ingen DB-migration (och kommer inte heller behövas i PR-A — `meta`
  är jsonb).
- Ingen pipeline-koppling.

---

## Nästa steg efter denna doc-PR mergad

1. Användaren beslutar Q1–Q3 ovan.
2. Branch `seo-f3-promotion-ux` lever vidare för PR-A (eller PR-AB
   sammanslagen) — **eller** vi mergar denna doc-PR till master och
   skapar nya branches per implementations-PR. Användarens preferens.
3. Implementations-PR(s) levereras med acceptanskriterier + tester
   enligt detta dokument.
