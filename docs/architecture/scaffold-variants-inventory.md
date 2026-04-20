# Scaffolds + Variants — Inventarium och beslutsunderlag

**Skapat:** 2026-04-17. Avsedd som **läsbart underlag inför beslut** om vad som ska behållas, slås ihop, eller skrivas om. Inget runtime-data — koden är fortfarande source of truth (se `src/lib/gen/scaffolds/`, `config/scaffold-variants/`).

> **Status 2026-04-17 (uppdaterad):** **Val A genomförd** — fälten `styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric` är borttagna ur `ScaffoldVariant`-typen, alla 21 variant-JSON-filer, `derive-variants-from-dossiers.ts` och variant-blocket i `system-prompt.ts`. Variants levererar nu enbart **högsignal design-axes** (label, description, keywords, fontPairings, signatureMotif, themeTokens, promptHints, colorMode, sourceTemplateIds, default). Generic regelmotor-genererat brus är borta från prompten.
>
> **Originalkontext (för historik):** En genomgång upptäckte att 20 av 21 variants delade nära-identiska generiska text-block för dessa fyra fält — det var inte ett misstag i datan utan en följd av hur `derive-variants-from-dossiers.ts` aggregerade `runtimeGuidance` från `template-library.generated.json` (byggd av `deriveTemplateRuntimeGuidance()` — en regelbaserad fixstring-pool). Detta dokument förklarar fortfarande mekanismen för referens, även om de fyra variant-fälten nu är borta.

---

## 1. De tio scaffolds — översikt

| ID | Label | siteKind | complexity | allowedBuildIntents | Variants | Default-variant | Anteckning |
|---|---|---|---|---|---|---|---|
| `base-nextjs` | Base Next.js | marketing | simple | website, template | 4 | `starter-neutral` | Neutral fallback + 3 starter-axes (mono dev, soft studio, fresh teal). |
| `landing-page` | Landing Page | marketing | medium | website, template | **5** | `corporate-grid` | Bredast täckning. Enda scaffold med >2 variants. |
| `saas-landing` | SaaS Landing | marketing | medium | website, template | 2 | `friendly-saas` | Tydlig nisch. |
| `portfolio` | Portfolio | editorial | medium | website, template | 2 | `minimal-studio` | Tydlig nisch. |
| `blog` | Blog | editorial | medium | website, template | 2 | `editorial-serif` | Tydlig nisch. |
| `dashboard` | Dashboard | app | advanced | app | 2 | `glass-frosted` | **Överlapp med app-shell.** |
| `auth-pages` | Auth Pages | app | simple | website, app, template | 1 | `clean-auth` | Smal. Diskussion: behåll eller absorbera. |
| `ecommerce` | E-handel | commerce | advanced | website, template | 3 | `megastore-clean` | Tydlig nisch. |
| `content-site` | Content Site | marketing | medium | website, template | 1 | `warm-editorial` | **Överlapp med landing-page.** Diskussion: slå ihop. |
| `app-shell` | App Shell | app | medium | app | 2 | `clean-utility` | **Överlapp med dashboard.** |

**Totalt:** 10 scaffolds, 26 variants (per `config/scaffold-variants/_index/variant-embeddings.json`). Variants ojämnt fördelade (5 hos landing-page, 4 hos base-nextjs, 1 hos vissa scaffolds).

---

## 2. Variants — detalj per scaffold

> **Notation:**
> - **Design-axes** = handredigerade fält (label, description, keywords, fontPairings, signatureMotif, themeTokens, promptHints, colorMode, default).
> - **Guidance-fält** = härledda från template-library (styleRules, sectionInventory, avoidPatterns, worldClassRubric, sourceTemplateIds).
> - 🟢 = scaffold-relevant och specifik. 🟡 = generic men inte direkt felaktig. 🔴 = direkt missvisande för scaffolden.

### 2.1 `base-nextjs` (4 variants)

> **Uppdaterad 2026-04-20:** Utökad från 1 → 4 starter-axes. `starter-neutral` ligger kvar som default neutral fallback; tre nya varianter täcker dev-, designer- och fresh-product-leaning starter-prompts utan att stjäla ranking från andra scaffolds. Alla fyra följer samma kanoniska variant-format ($schema-ref + minimal token-uppsättning + 5 layouts/4 motifs/4 antiPatterns).

| Variant | Default | colorMode | Heading / Body (primär · alt) | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `starter-neutral` | ✓ | either | Geist / Geist · Inter / Inter | quiet near-monochrome shell, restrained tokens, and extension-first clarity | 🟢 handredigerad |
| `playground-mono` | – | dark | JetBrains Mono / Inter · Geist Mono / Geist | calm dark playground shell, mono headings, and prototype-friendly chrome | 🟢 handredigerad |
| `studio-soft` | – | light | Inter / Inter · Plus Jakarta Sans / Inter | soft warm light surfaces, generous whitespace, and quiet designer-leaning baseline | 🟢 handredigerad |
| `fresh-mint` | – | light | Geist / Geist · Manrope / Inter | crisp light surfaces, a fresh teal accent, and product-leaning starter rhythm | 🟢 handredigerad |

**Bedömning:** Bredd över starter-personligheter (neutral, dev, soft, fresh) utan att klampa in i landing-page eller dashboard. Default kvar på `starter-neutral` för fallback-rollen.

### 2.2 `landing-page` (5 variants — bredast)

> **Uppdaterad 2026-04-18:** Alla landing-page-varianter har nu **2 fontPairings** (primär + alternativ) så Brief-LLM kan välja det som passar prompten. `editorial-lux` fick också `bodyBackgroundImage` (subtil guld-glow) — tidigare flat-svart trots motif:ens "atmospheric, premium contrast"-anspråk.

| Variant | Default | colorMode | Heading / Body (primär · alt) | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `corporate-grid` | ✓ | light | Manrope / Inter · Plus Jakarta Sans / IBM Plex Sans | precise grid alignment, neutral surfaces, and partner-proof rhythm | 🟢 **handredigerad referens** |
| `warm-local` | – | light | DM Serif Display / DM Sans · Lora / Karla | warm tints, rounded surfaces, and softly layered cards | 🔴 sectionInventory har "pricing" — fel för café/frisör |
| `bold-startup` | – | dark | Space Grotesk / Inter · Bricolage Grotesque / Plus Jakarta Sans | high-contrast headlines, sharp gradients, velocity-driven proof blocks | 🟡 generic |
| `editorial-lux` | – | dark | Cormorant Garamond / Raleway · EB Garamond / Outfit | editorial framing, premium contrast, restrained luxury accents | 🟡 generic (article-list-mall) |
| `nature-flow` | – | light | Fraunces / Nunito Sans · Source Serif 4 / Karla | organic curves, earth gradients, natural contrast | 🔴 sectionInventory har "pricing" + sourceTemplates `documentation-taxonomy` |

**Bedömning:** Bredd är värdefull. **`corporate-grid`** är referensen för hur en handredigerad variant ska se ut (specifika styleRules om "12-column grid", specifika sectionInventory). Övriga fyra har bra design-axes men generiska guidance-fält.

### 2.3 `saas-landing` (2 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `friendly-saas` | ✓ | light | Sora / Nunito Sans | friendly product framing, rounded proof blocks, accessible SaaS clarity | 🟡 generic dashboard-mall |
| `dev-terminal` | – | dark | JetBrains Mono / Space Grotesk | terminal previews, code framing, dense technical product proof | 🟡 generic dashboard-mall |

**Bedömning:** Två tydligt åtskilda design-axes (friendly vs dev). Skulle vinna mycket på handredigerad sectionInventory (pricing tier-mönster, hero-dashboard-card, FAQ).

### 2.4 `portfolio` (2 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `minimal-studio` | ✓ | light | Instrument Sans / Inter | quiet studio minimalism, generous spacing, refined project metadata | 🟡 generic article-mall |
| `showcase-bold` | – | dark | Bricolage Grotesque / DM Sans | image-led project framing, strong contrast, curated metadata overlays | 🟡 generic article-mall |

**Bedömning:** Bra design-axes. sourceTemplateIds inkluderar `authentication-partner-gallery` på båda — udda referens.

### 2.5 `blog` (2 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `editorial-serif` | ✓ | light | Playfair Display / Source Sans 3 | editorial type hierarchy, generous reading rhythm, calm framing | 🟡 generic article-mall |
| `tech-minimal` | – | either | IBM Plex Sans / IBM Plex Mono | clean technical hierarchy, docs-adjacent rhythm, restrained developer polish | 🟡 generic article-mall |

**Bedömning:** Bra typografisk distinktion. sectionInventory är schematisk men passar blog-domänen rimligt.

### 2.6 `dashboard` (2 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `glass-frosted` | ✓ | dark | Space Grotesk / Inter | frosted panels, layered cards, subtle glowing metrics | 🟡 generic dashboard-mall |
| `dense-terminal` | – | dark | JetBrains Mono / IBM Plex Sans | terminal chrome, dense panels, monospace hierarchy, precise contrast | 🟡 generic dashboard-mall |

**Bedömning:** Två starka stilval. sourceTemplateIds för `dense-terminal` är fyra `ai-*`-templates — passar developer-mood men ingen är dashboard-specifik. `glass-frosted` har en `authentication-clerk`-referens som avviker från analytics-temat.

### 2.7 `auth-pages` (1 variant)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `clean-auth` | ✓ | either | Inter / Inter | clear auth framing, trust cues, practical form polish | 🔴 sectionInventory är dashboard-mall ("table or chart area") |

**Bedömning:** Endast 1 variant. sectionInventory är direkt fel — auth-sidor har inte "table or chart area". Aggregeringen ärvde fel mall.

### 2.8 `ecommerce` (3 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `megastore-clean` | ✓ | light | Inter / Inter | clean retail IA, strong faceting rhythm, conversion-first clarity | 🟡 generic dashboard-mall |
| `boutique-warm` | – | light | DM Serif Display / Inter | editorial storefront framing, warm surfaces, tactile merchandising | 🟡 generic dashboard-mall |
| `streetwear-bold` | – | dark | Bebas Neue / Inter | hard contrast, oversized type, campaign-led product storytelling | 🟡 generic dashboard-mall |

**Bedömning:** Tre tydligt åtskilda stilar. Alla tre delar exakt samma generiska sectionInventory ("primary entry / supporting / overview metrics / filters / table or chart area") — borde vara "catalog grid / product detail / cart / checkout".

### 2.9 `content-site` (1 variant)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `warm-editorial` | ✓ | light | Merriweather / DM Sans | content-first rhythm, warm editorial hierarchy, calm section flow | 🟡 generic article-mall |

**Bedömning:** Endast 1 variant. Hela scaffolden överlappar `landing-page`. Se sektion 5 för rekommendation.

### 2.10 `app-shell` (2 variants)

| Variant | Default | colorMode | Heading / Body | signatureMotif | Guidance-kvalitet |
|---|---|---|---|---|---|
| `clean-utility` | ✓ | either | Inter / Inter | clean utility shell, structured spacing, practical interface contrast | 🟡 generic dashboard-mall |
| `immersive-dark` | – | dark | Sora / Inter | immersive dark shell, glowing action states, dramatic workspace framing | 🟡 generic dashboard-mall |

**Bedömning:** Två starka stilval. Båda har `authentication-clerk` + `admin-dashboard-modernize` som sourceTemplates — relevanta för shell-strukturen.

---

## 3. Hur variants byggs — verkligheten

```
Vercel-templates (skrapad data)
        │
        ▼
data/external-template-pipeline/reference-library/dossiers/<id>/
   ├─ manifest.json    ← per-template metadata + selectedFiles (riktig kod)
   ├─ summary.md
   └─ selected_files/  ← faktiska TSX/CSS-utdrag
        │
        │ scripts/template-library/build-template-library.ts
        ▼
src/lib/gen/template-library/template-library.generated.json
   (97 entries, var och en med en runtimeGuidance:{styleRules,sectionInventory,
    avoidPatterns,worldClassRubric} producerad av deriveTemplateRuntimeGuidance)
        │
        │ scripts/scaffolds/derive-variants-from-dossiers.ts
        │ (har 21 hand-skrivna BLUEPRINTS med design-axes)
        ▼
config/scaffold-variants/<scaffoldId>/<variantId>.json
   (design-axes från blueprint + guidance-fält aggregerade från
    de 4 high-scoring entriesnas runtimeGuidance)
```

### 3.1 `deriveTemplateRuntimeGuidance` är regelbaserad — INTE LLM
Filen `src/lib/gen/template-library/runtime-guidance.ts` är en deterministisk regelmotor. Den läser `entry.signals` (auth, dashboard, pricing, blog, portfolio, ecommerce, …) och pushar fixerade strängar in i fyra arrays. Sen `limit(arr, 4)` eller `limit(arr, 5)`.

Resultat: alla template-entries med `signals.dashboard = true` får samma 4 strängar i `sectionInventory` ("overview metrics", "filters or controls", "table or chart area"). När `derive-variants-from-dossiers.ts` plockar 4 sådana entries blir variant-fältet samma 4 strängar.

### 3.2 Aggregeringen i `aggregateGuidance()` slumpmässigt nog
- Tar `flatMap` över de 4 top-rankade entries' `runtimeGuidance.styleRules`, dedupar, slice 4.
- Samma för sectionInventory (5), avoidPatterns (4), worldClassRubric (5).

Eftersom varje entry har ~2-5 regler i varje fält och rule-pool:en är liten (~15-20 fixerade strängar totalt) blir resultatet att de flesta variants får ungefär samma uppsättning.

### 3.3 Vad som faktiskt är högkvalitativt i pipelinen
| Lager | Källa | Kvalitet |
|---|---|---|
| Dossier `selectedFiles` | Skrapad riktig Vercel-kod | 🟢 Riktig kod, högt värde — används i `## Structural References` när enabled |
| Dossier `strengths`, `signals`, `recommendedScaffoldIds` | Kuration | 🟢 Mestadels bra; några edge-cases |
| Dossier `summary`, `description` | Skrapad | 🟢 Bra |
| Dossier/entry `runtimeGuidance` | Regelmotor (`deriveTemplateRuntimeGuidance`) | 🟡 Generiska schablonsträngar |
| Variant `design-axes` | Hand-skrivna i `derive-variants-from-dossiers.ts` BLUEPRINTS | 🟢 Specifika, scaffold-relevanta |
| Variant `guidance-fält` | Aggregat av entry-runtimeGuidance | 🟡 Generiska, ofta felmappade |

---

## 4. Skripten — vad de gör och vad som är värt att förbättra

### 4.1 `scripts/scaffolds/derive-variants-from-dossiers.ts`
- 21 BLUEPRINTS hard-codade i topp.
- Per blueprint: matchar template-library entries via `selectors` (titleIncludes, signals, useCaseTags, …) + qualityScore.
- Tar top 4 → aggregerar runtimeGuidance → skriver JSON till disk.
- **Bra:** design-axes (det viktigaste) kommer från BLUEPRINTS, inte från regler.
- **Mindre bra:** guidance-fält genereras med samma deterministiska regelpool som dossier-runtimeGuidance — de blir generiska.

### 4.2 `scripts/template-library/build-template-library.ts`
- Läser dossier-manifest + selected_files.
- Producerar `template-library.generated.json` (1.2 MB).
- Kallar `deriveTemplateRuntimeGuidance()` på varje entry när `entry.runtimeGuidance` saknas i dossiern (och om dossiern har en, behålls den).
- Detta är där dossiers' generiska runtimeGuidance kommer ifrån.

### 4.3 Konkret förbättringsförslag på skripten
**Tre val (rangordnade):**

#### Val A — radera guidance-aggregeringen helt (rekommenderat)
Variants ska bara ha **design-axes** (de hand-skrivna fälten). `styleRules`, `sectionInventory`, `avoidPatterns`, `worldClassRubric` tas bort från variant-typen och från output. Då slipper LLM:en bruset, och scaffoldens egna `qualityChecklist` + `research.upgradeTargets` är det som styr "vad ska den göra".

- **Förändringar:** ta bort fyra fält från `ScaffoldVariant`-typen + `derive-variants-from-dossiers.ts` `aggregateGuidance` + från `system-prompt.ts` block-byggaren + från alla 21 variant-JSON-filer.
- **Risk:** låg — fälten är genericbrus, inte signal.
- **Vinst:** hög — system-prompten blir renare, LLM:en får färre motstridiga signaler.

#### Val B — behåll fälten men gör dem opt-in per blueprint
Fyll bara i guidance-fält när blueprintens författare aktivt skrivit dem (som `corporate-grid`). Annars: tomma. Om `aggregateGuidance` ska köras alls, gör det bara när blueprint flaggar `inheritGuidanceFromTemplates: true`.

- **Förändringar:** mindre script-ändring + skriv ett "world-class"-exempel per scaffold över tid.
- **Risk:** låg.
- **Vinst:** medel — möjliggör handcurerad kvalitet utan att bruset finns kvar.

#### Val C — fixa runtime-guidance-regelmotorn
Skriv om `deriveTemplateRuntimeGuidance` så den producerar mer specifika strängar baserat på fler signaler (ex. `signals.cms` + `siteForm = restaurant-or-cafe` ger café-specifika sectionInventory).

- **Förändringar:** stor — kräver mycket mer regeldata + tester.
- **Risk:** medium — komplex regelmotor.
- **Vinst:** medel — fortfarande regler, fortfarande generiskt jämfört med riktig kuration.

**Min rekommendation: Val A.** De fält som ger värde idag är design-axes + scaffoldens egna fält. Guidance-aggregeringen är kosmetik som faktiskt försämrar prompten.

---

## 5. Konsoliderings-rekommendationer

### 5.1 `content-site` ↔ `landing-page`
**Fakta:**
- Båda `siteKind: marketing`, `complexity: medium`, samma `allowedBuildIntents`.
- `content-site.description` säger "Great for landing pages, portfolios, and blogs" — direkt överlapp.
- `content-site` har 1 variant; `landing-page` har 5.
- Båda matchas av `LANDING_KEYWORDS` och `CONTENT_KEYWORDS` i `matcher.ts` — keyword-listorna delar 7 ord.

**Rekommendation:** Slå ihop. Flytta `warm-editorial` som en sjätte landing-page-variant (eller döp om till `editorial-content`). Ta bort content-site-scaffolden. **−1 scaffold.**

### 5.2 `dashboard` ↔ `app-shell`
**Fakta:**
- Båda `siteKind: app`, båda har sidebar+tables.
- Distinktion: dashboard är analytics-tung (`charts` i features), app-shell är operations/CRM (`settings`, `dash-widgets`).
- Båda har 2 variants vardera.
- Templates rekommenderar ofta båda samtidigt (`recommendedScaffoldIds: ["app-shell", "dashboard"]`).

**Rekommendation:** Behåll separat _men skriv om descriptionerna_ så distinktionen är skarp. Alternativt: slå ihop till `dashboard` med tydliga variants `analytics-cockpit` (charts-dominans) vs `operations-shell` (queue/CRM-dominans). Båda val ger −1 mental-modellbörda.

### 5.3 `auth-pages` som egen scaffold?
**Fakta:**
- Endast 1 variant.
- `clean-auth.sectionInventory` har "table or chart area" — direkt fel (regelmotor-artefakt).
- `recommendedScaffoldIds` på Clerk-dossiern är `["auth-pages", "dashboard", "app-shell"]` — auth-sidor är nästan alltid del av en app.

**Rekommendation:** Behåll som scaffold för "skapa bara login-flödet" use-case, men säkerställ att den inte automatiskt väljs för bredare prompts. Fixa `clean-auth.sectionInventory` (tomt eller "login form / signup form / recovery"). Att absorbera den i app-shell är ett alternativ men kostar funktionalitet.

### 5.4 Ingen ändring för
- `base-nextjs` — bra fallback, lämna.
- `landing-page` — bredast och bäst representerad.
- `saas-landing`, `portfolio`, `blog`, `ecommerce` — tydliga nischer, bra design-axes.

---

## 6. Konkret nästa-pass-lista (rangordnad efter impact / risk)

| # | Åtgärd | Risk | Impact | Berör |
|---|---|---|---|---|
| 1 | **Töm guidance-fält i alla variants** (Val A från §4.3) | ✅ **Genomfört 2026-04-17.** Fält borttagna ur typ, parser, derive-script, 21 JSON-filer, system-prompt.ts variant-block, strict schema, tester uppdaterade. |
| 2 | **Slå ihop content-site → landing-page** (§5.1): flytta `warm-editorial`, ta bort scaffolden | ⏳ Återstår — backoffice `_delete_scaffold` i `scaffold_lifecycle.py:1949` täcker det mesta automatiskt. Kräver manuell flytt av variant-fil först. |
| 3 | **Skarpa upp dashboard vs app-shell descriptions** | ⏳ Återstår — bara textändring i två manifest. |
| 4 | **Skriv 1 handcurerad variant per scaffold över tid** | ⏳ Återstår — inkrementellt, corporate-grid-stil. |
| 5 | **Fixa konkreta sourceTemplateIds-felmappningar** | ⏳ Återstår — `clean-auth` saknar Clerk; `nature-flow` har `documentation-taxonomy`; `dense-terminal` har bara `ai-*`. |

---

## 7. Vad som synkas vid ändring

Vid scaffold-borttagning, sammanslagning, eller variantfältsförändring:

| Yta | Fil | Vad behöver uppdateras |
|---|---|---|
| Runtime-typ | `src/lib/gen/scaffolds/types.ts` | `ScaffoldId` union, `SCAFFOLD_CLIENT_LIST` |
| Runtime-registry | `src/lib/gen/scaffolds/registry.ts` | `BASE_SCAFFOLDS` array |
| Variant-typ | `src/lib/gen/scaffold-variants/types.ts` | Vid fältborttagning |
| Variant-registry | `src/lib/gen/scaffold-variants/registry.ts` | Parser-kod om fält ändras |
| Build-skript | `scripts/scaffolds/derive-variants-from-dossiers.ts` | BLUEPRINTS array, `aggregateGuidance` |
| Matcher | `src/lib/gen/scaffolds/matcher.ts` | Keyword-listor (LANDING/CONTENT/etc.), `defaultScaffoldForIntent` |
| Embeddings | `src/lib/gen/scaffolds/scaffold-embeddings.json` | Regenereras via `npm run scaffolds:embeddings` |
| Backoffice | `backoffice/pages/scaffolds.py`, `backoffice/pages/scaffold_lifecycle.py`, `backoffice/pages/research.py` | Kontroller av scaffold-id, sidolist |
| Dokumentation | `docs/architecture/scaffold-schema.md`, `docs/architecture/glossary.md`, `docs/schemas/scaffold-contract.md`, `docs/architecture/repository-and-platform.md` | Tabell över scaffolds, distinktioner |
| Cursor-regler | `.cursor/rules/scaffold-architecture.mdc`, `.cursor/skills/sajtmaskin-context/SKILL.md` | Lista av 10 → 9 (vid sammanslagning) |
| Tester | `src/lib/gen/scaffolds/matcher.test.ts`, `src/lib/gen/orchestration-snapshot.test.ts`, build-spec, eval-prompts | Asserter på scaffold-id |
| Snapshot-data | `data/scaffold-eval/prompts.json` | Scaffold-id i förväntade resultat |

---

## 8. Sammanfattning för icke-tekniska beslutsfattare

- **Idag:** 10 scaffolds, 26 variants. Flera varianter är handredigerade (referens: `corporate-grid`, samtliga `base-nextjs`-varianter) och ger LLM:en specifika instruktioner; några äldre varianter ärver fortfarande generisk mall-text från ett deterministiskt regel-script.
- **Det generiska bruset gör inte sajter sämre i praktiken** — LLM:en ignorerar mestadels det som inte passar — men det tar plats i system-prompten och kan i edge-fall förvirra.
- **Två scaffolds överlappar betydande:** content-site med landing-page (samma roll), dashboard med app-shell (snarlik roll).
- **Mest värdefulla pipelinedelar** är dossier-koden (`selectedFiles`) och de hand-skrivna design-axes-fälten i variants. Inte runtime-guidance-regelmotorn.
- **Bästa enskilda förbättring:** ta bort guidance-aggregeringen ur variants (Val A i §4.3). En commit, hög signal-vinst.

---

## 9. Vad som INTE undersökts här

- Embeddings-genereringen (`scripts/scaffolds/build-scaffold-embeddings.ts`) — fungerar troligen oförändrad efter scaffold-borttagning, men måste regenereras.
- Quality-gate / autofix-pipeline — orelaterat till scaffold-val.
- Brief-LLM:ens val av scaffold-variant-hint — använder samma blueprint-design-axes och påverkas inte av guidance-fält.

---

## 10. Hänvisningar

- Scaffold runtime-arkitektur: [`docs/architecture/scaffold-schema.md`](./scaffold-schema.md)
- Glossary: [`docs/architecture/glossary.md`](./glossary.md)
- Pipeline-fas: [`docs/architecture/fas2-orchestration-and-build.md`](./fas2-orchestration-and-build.md)
- Variant-typ: [`src/lib/gen/scaffold-variants/types.ts`](../../src/lib/gen/scaffold-variants/types.ts)
- Build-skript: [`scripts/scaffolds/derive-variants-from-dossiers.ts`](../../scripts/scaffolds/derive-variants-from-dossiers.ts)
- Runtime-guidance-regelmotor: [`src/lib/gen/template-library/runtime-guidance.ts`](../../src/lib/gen/template-library/runtime-guidance.ts)
- Backoffice: `backoffice/pages/scaffolds.py`, `backoffice/pages/scaffold_lifecycle.py`
