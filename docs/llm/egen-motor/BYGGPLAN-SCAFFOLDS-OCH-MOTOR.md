# Byggplan: Scaffolds & Motorförbättringar

> Datum: 2026-03-10
> Branch: `egen-motor-v2`
> Syfte: Identifiera alla fel, buggar, saknade delar och inkonsekvenser i scaffold-systemet och den egna motorn — samt ge en prioriterad byggplan med matris.

---

## DEL 1: Identifierade fel, buggar och brister

### A. Scaffold-systemet — strukturella problem

#### A1. CSS-tokenformat-inkonsekvens (BUG — hög prioritet)

Scaffold-manifestens `globals.css` använder **råa oklch-värden** med `var(--background)`:

```css
:root {
  --background: oklch(0.15 0.01 260);
}
body { background: var(--background); }
```

Men `project-scaffold.ts` (nedladdningsbar zip) använder **Tailwind v4 `@theme inline`-format** med `hsl`-värden och `--color-`-prefix:

```css
@theme inline {
  --color-background: hsl(222 47% 11%);
}
@layer base {
  body { @apply bg-background text-foreground; }
}
```

**Konsekvens:** Om modellen genererar kod som blandar dessa format, eller om scaffold-filer mergas med project-scaffold, kan CSS-variabler krocka. `bg-background` i Tailwind v4 letar efter `--color-background`, inte `--background`.

**Fix:** Alla scaffolds bör använda `@theme inline` + `--color-*`-prefix konsekvent med project-scaffold.ts.

---

#### A2. Scaffold-filer saknar `@theme inline`-wrapping (BUG)

Scaffold-manifestens globals.css skriver CSS-variabler direkt under `:root {}` utan `@theme inline`. I Tailwind CSS v4 behöver custom design tokens vara innanför `@theme` för att vara tillgängliga som utility-klasser.

Utan det fungerar `bg-background` bara om en globals.css redan har definerat variablerna via `@theme`, men scaffoldens egna filer gör det inte.

---

#### A3. Dubblering av layout/globals vid merge (DESIGN-BRIST)

`mergeVersionFiles()` slår ihop scaffold-bas med genererade filer. Men scaffoldens `app/layout.tsx` och `app/globals.css` importerar specifikt "Norrsken Digital" (content-site) eller "Acme Inc" (app-shell).

Om modellen genererar egna `app/layout.tsx` och `app/globals.css` (vilket den nästan alltid gör), överskrids scaffoldens filer. Scaffoldens header/footer-komponenter refereras då från en layout som inte existerar.

**Konsekvens:** Orphaned imports. `SiteHeader`/`SiteFooter` importeras i scaffoldens layout men genererade layouten har inte dessa imports.

**Fix:** Antingen:
- Scaffold-prompten behöver starkare instruktioner om att BEHÅLLA scaffoldens layout
- Eller scaffoldens layout bör vara mer generisk (inga hårdkodade företagsnamn)

---

#### A4. Scaffold-serialisering ger bara en tabell, inte filinnehåll (BEGRÄNSNING)

`serializeScaffoldForPrompt()` anropar `buildFileContext()` som bygger en **sammanfattningstabell** (path, lines, exports, imports) — inte det faktiska filinnehållet. Modellen ser alltså aldrig scaffoldens kod, bara metadata.

**Konsekvens:** Modellen kan inte redigera scaffolden, bara veta att den finns. Det motverkar hela poängen med "edit-over-generate".

**Fix:** Scaffold-serialiseringen bör inkludera fullständigt filinnehåll (med en maxgräns, typ 12K chars) så modellen kan modifiera filerna direkt.

---

#### A5. `ScaffoldFamily` är en stängd union — kräver kodändring för nya scaffolds (DESIGN-BRIST)

```typescript
export type ScaffoldFamily = "base-nextjs" | "content-site" | "app-shell";
```

Att lägga till `landing-page` kräver ändring av denna typ, registreringslogik i `registry.ts`, och matchningslogik i `matcher.ts`. Det är 4+ filer att röra per ny scaffold.

**Fix:** Överväg att göra `ScaffoldFamily` till en `string`-baserad typ och låt scaffolds registrera sig dynamiskt. Alternativt: acceptera manuell registrering men dokumentera exakt vilka filer som behöver ändras.

---

### B. Matcher-logik — brister

#### B1. Obalanserade tröskelvärden (BUG — hög prioritet)

```typescript
if (appScore >= 2) return getScaffoldByFamily("app-shell");
if (contentScore >= 1) return getScaffoldByFamily("content-site");
```

`content-site` triggas av **ett enda keyword**, medan `app-shell` kräver **två**. Ord som "platform", "software", "service" finns i CONTENT_KEYWORDS men beskriver ofta appar. En prompt som "Build a project management platform" matchar content-site (pga "platform") trots att dashboard/app-shell vore bättre.

**Fix:** Separera keywords per kategori (inte bara content vs app), vikta ord, och kräv minst 2 för alla familjer.

---

#### B2. Ingen matchning per planerad scaffold (SAKNAS)

Matchern returnerar bara tre möjliga värden. Även efter att `landing-page`, `portfolio` etc. byggs finns ingen logik för att skilja dem åt.

**Fix:** Matchern måste utökas till att:
1. Poängsätta mot varje scaffold (inte bara familj)
2. Använda scaffoldens `tags` och `keywords` (som idag inte används av matchern)
3. Returnera bästa match oavsett familj

---

#### B3. Keyword-matchning har substring-problem (BUG)

`lower.includes(kw)` betyder att "chart" matchar "charter", "blog" matchar "blogosphere", "app" matchar "application", "happy", "apple". Korta keywords genererar false positives.

**Fix:** Använd ordgränsbaserad matchning (`\b`-regex eller tokenisering).

---

#### B4. Svenska och engelska keywords inte balanserade (BRIST)

CONTENT_KEYWORDS har svenska ord ("hemsida", "webbplats", "byrå", "fotograf") men APP_KEYWORDS har bara engelska. En prompt på svenska som "bygg ett adminverktyg med statistik" matchar ingenting i APP_KEYWORDS.

**Fix:** Lägg till svenska motsvarigheter: "instrumentpanel", "admin", "statistik", "användare", "diagram", "sidopanel".

---

### C. Prompt-flöde & system prompt — brister

#### C1. Scaffold-kontext injiceras i user-meddelandet, inte som eget lager (DESIGN-BRIST)

Scaffold prepend:as direkt till prompten:
```typescript
optimizedMessage = `${scaffoldContext}\n\n---\n\n${optimizedMessage}`;
```

Detta blandar ihop scaffoldens instruktioner med användarens prompt. Modellen kan inte skilja "detta är startfiler att redigera" från "detta vill användaren ha".

v0 hanterar scaffold/docs som del av system-prompten (Lager 2), inte user-meddelandet (Lager 3).

**Fix:** Injicera scaffold-kontext i system-promptens dynamiska del (efter `buildDynamicContext`) som ett eget `## Scaffold`-block.

---

#### C2. System-prompten nämner inte scaffolds alls (SAKNAS)

`STATIC_CORE` har en sektion "Existing Files (do NOT regenerate)" men den listar bara generiska runtime-filer (layout, globals, shadcn). Den nämner inte att en scaffold kan finnas, eller hur modellen ska hantera scaffold-filer.

**Fix:** Lägg till en sektion i STATIC_CORE eller i `buildDynamicContext` som förklarar scaffold-konceptet för modellen.

---

#### C3. `buildDynamicContext` och scaffold-serialisering är kopplade via stream-route (KOMPLEXITET)

All scaffold-logik lever i stream-routen (1452 rader). Scaffold-matchning, serialisering och injection borde abstraheras till en egen funktion som stream-routen anropar.

---

#### C4. Brief skickas inte till scaffolden (SAKNAS)

`buildSystemPrompt()` i stream-routen skapas utan brief-data vid nya chattar:

```typescript
const engineSystemPrompt = buildSystemPrompt({
  intent: engineIntent,
  imageGenerations: resolvedImageGenerations,
});
```

Briefen (projektnamn, målgrupp, ton, stil) existerar i prompten men inte i system-prompten. Scaffolden vet inget om användarens brief.

**Fix:** Skicka brief till `buildSystemPrompt()` även för nya chattar, inte bara för follow-ups.

---

### D. Autofix & validering — brister

#### D1. Transitive UI-beroenden löses bara ett steg (BRIST)

`collectRequiredUiComponents()` i `project-scaffold.ts` hittar transitiva beroenden (shadcn-komponent A importerar B) men bara ett steg djupt. Om B importerar C, missas C.

**Fix:** Rekursiv resolution tills inga fler beroenden hittas.

---

#### D2. Autofix har ingen scaffold-medvetenhet (SAKNAS)

Autofix-pipeline körs efter generering men vet inte om en scaffold användes. Om modellen glömt att importera en scaffold-komponent (t.ex. `SiteHeader`) kan autofix inte fixa det.

**Fix:** Ge autofix tillgång till scaffold-manifestets filslista så den kan verifiera att alla scaffold-exporter fortfarande refereras.

---

#### D3. Merge-logik har inget konflikthantering (BRIST)

`mergeVersionFiles()` gör enkel path-override:
```typescript
for (const f of newFiles) { merged.set(f.path, f); }
```

Om modellen genererar `app/globals.css` med bara tre rader (missade token-definitionen), försvinner scaffoldens fullständiga CSS.

**Fix:** Överväg merge-strategi med varningar vid signifikant storleksskillnad, eller deep-merge för CSS-filer.

---

### E. Preview & nedladdning — brister

#### E1. Scaffold-CSS och project-scaffold CSS använder olika format (BUG, duplicering av A1)

Scaffoldens `globals.css` producerar `--background: oklch(...)` men project-scaffold genererar `--color-background: hsl(...)`. Nedladdad zip har annat färgformat än preview.

---

#### E2. Knowledge base är keyword-baserad, inte semantisk (BEGRÄNSNING)

`searchKnowledgeBase()` tokeniserar query och matchas mot `snippet.keywords` med exakt/substring-matchning. En prompt om "build a recipe sharing app" hittar inte docs om "data fetching patterns" trots att det är relevant.

---

### F. UI & state — mindre problem

#### F1. Scaffold-val syns inte i builder history (SAKNAS)

Om en scaffold används finns ingen indikation i chatten eller versionshistoriken. Användaren vet inte att resultatet baseras på en scaffold.

---

## DEL 2: Fullständig matris

### Scaffold-implementationsmatris

| # | Scaffold | Status | Behöver | Beroende av | Prioritet | Uppskattad insats |
|---|----------|--------|---------|-------------|-----------|-------------------|
| 1 | `base-nextjs` | Finns | CSS-fix (A1/A2), generisk layout | — | P0 | 1h |
| 2 | `content-site` | Finns | CSS-fix, ta bort hårdkodat namn, blir fallback | — | P0 | 1h |
| 3 | `app-shell` | Finns | CSS-fix, ta bort hårdkodat namn | — | P0 | 1h |
| 4 | `landing-page` | Saknas | Splitta från content-site, hero/features/CTA/trust | #2 fixad | P1 | 3h |
| 5 | `saas-landing` | Saknas | Product-hero, pricing, FAQ, dashboard-bild | #4 | P1 | 3h |
| 6 | `portfolio` | Saknas | Intro, work-grid, project-detail, about, testimonial | #4 | P1 | 3h |
| 7 | `blog` | Saknas | Post-feed, featured, category, single-post, newsletter | #4 | P2 | 3h |
| 8 | `dashboard` | Saknas | Splitta från app-shell, stats/charts/tables | #3 fixad | P2 | 3h |
| 9 | `auth-pages` | Saknas | Login/register/reset, auth-layout | #8 | P2 | 2h |
| 10 | `ecommerce` | Saknas | Storefront, product-grid, category, cart | #7 | P3 | 4h |

### Bug-fix-matris

| # | Problem | Typ | Var | Prioritet | Insats | Beroende av |
|---|---------|-----|-----|-----------|--------|-------------|
| A1 | CSS-tokenformat-inkonsekvens | BUG | scaffolds/*/manifest.ts, project-scaffold.ts | P0 | 2h | — |
| A2 | Saknar @theme inline | BUG | scaffolds/*/manifest.ts | P0 | 1h | A1 |
| A4 | Serialisering ger bara tabell | DESIGN | serialize.ts | P0 | 2h | — |
| B1 | Obalanserade tröskelvärden | BUG | matcher.ts | P0 | 1h | — |
| B3 | Substring false positives | BUG | matcher.ts | P1 | 1h | — |
| C1 | Scaffold i user msg istf system | DESIGN | stream/route.ts | P1 | 3h | — |
| C2 | System prompt nämner inte scaffolds | SAKNAS | system-prompt.ts | P1 | 1h | — |
| C4 | Brief skickas inte vid nya chattar | SAKNAS | stream/route.ts | P1 | 1h | — |
| B2 | Matcher per scaffold, inte familj | SAKNAS | matcher.ts, types.ts | P1 | 3h | nya scaffolds |
| B4 | Svenska APP_KEYWORDS | BRIST | matcher.ts | P1 | 0.5h | — |
| A3 | Orphaned imports vid merge | DESIGN | scaffolds/manifest.ts | P1 | 2h | — |
| D1 | Transitiva UI-beroenden | BRIST | project-scaffold.ts | P2 | 1h | — |
| D2 | Autofix scaffold-medvetenhet | SAKNAS | autofix/pipeline.ts | P2 | 2h | — |
| D3 | Merge utan konflikt | BRIST | version-manager.ts | P2 | 2h | — |
| E2 | KB keyword-only | BEGRÄNSNING | knowledge-base.ts | P3 | 8h+ | — |
| F1 | Scaffold-val osynligt i UI | SAKNAS | ChatInterface.tsx | P3 | 2h | — |

### Motorförbättringsmatris

| # | Förbättring | Område | Prioritet | Insats | Effekt |
|---|-------------|--------|-----------|--------|--------|
| M1 | Scaffold-kontext → system prompt | Promptlager | P1 | 3h | Korrekt lagerseparation |
| M2 | Full filinnehåll i scaffold-serialisering | Scaffold | P0 | 2h | Edit-over-generate möjligt |
| M3 | Per-scaffold matchning (inte per familj) | Matcher | P1 | 3h | Bättre val av scaffold |
| M4 | Ordgränsbaserad keyword-matchning | Matcher | P1 | 1h | Färre false positives |
| M5 | Brief i system prompt vid nya chattar | Promptlager | P1 | 1h | Bättre kontext till modellen |
| M6 | Generisk scaffold-layout utan hårdkodade namn | Scaffold | P0 | 1h | Färre orphaned refs |
| M7 | @theme inline konsekvent i alla scaffolds | Scaffold | P0 | 2h | CSS fungerar korrekt |
| M8 | Scaffold-medveten autofix | Autofix | P2 | 2h | Färre trasiga imports |
| M9 | Rekursiv UI-komponent-resolution | Download | P2 | 1h | Fungerande zip-nedladdning |
| M10 | Embedding-baserad KB-sökning | Kontext | P3 | 8h+ | Bättre docs-injection |

---

## DEL 3: Byggplan — fasordning

### Fas 0: Kritiska buggfixar (1-2 dagar)

Dessa måste fixas INNAN nya scaffolds byggs, annars ärver nya scaffolds samma problem.

1. **A1+A2+M7**: Migrera alla scaffolds globals.css till `@theme inline` + `--color-*`-format
2. **A4+M2**: Ändra `serializeScaffoldForPrompt()` att inkludera fullständigt filinnehåll
3. **M6+A3**: Gör scaffold-layouts generiska (placeholder-namn istf "Norrsken Digital" / "Acme Inc")
4. **B1**: Balansera tröskelvärden i matchern (minst 2 för alla familjer)
5. **B3+M4**: Byt till ordgränsbaserad matchning

Validering: `npx tsc --noEmit` + manuellt test av alla 3 scaffolds

### Fas 1: Första scaffold-vågen (3-5 dagar)

Kräver att Fas 0 är klar.

1. Implementera `landing-page` scaffold (splitta från content-site)
2. Implementera `saas-landing` scaffold
3. Implementera `portfolio` scaffold
4. Utöka `ScaffoldFamily` typen
5. Uppdatera `registry.ts` med nya scaffolds
6. **B2+M3**: Bygg per-scaffold matchning (varje scaffold har `keywords`-fält, matchern poängsätter mot alla)
7. **B4**: Lägg till svenska APP_KEYWORDS
8. Validera med testprompter per kategori

### Fas 2: Promptlager-förbättringar (2-3 dagar)

Kan köras parallellt med Fas 1.

1. **C1+M1**: Flytta scaffold-kontext från user message till system prompt
2. **C2**: Lägg till scaffold-instruktioner i STATIC_CORE
3. **C4+M5**: Skicka brief till buildSystemPrompt vid nya chattar
4. Refaktorera scaffold-logik ut ur stream-route till egen modul

### Fas 3: Andra scaffold-vågen (3-4 dagar)

1. Implementera `blog` scaffold
2. Implementera `dashboard` scaffold (splitta från app-shell)
3. Implementera `auth-pages` scaffold
4. Förbättra matcher med vikter och tie-break
5. Validera med utökad promptmatris

### Fas 4: Autofix & merge-förbättringar (2-3 dagar)

1. **D2+M8**: Scaffold-medveten autofix
2. **D3**: Intelligent merge med storlek-varningar
3. **D1+M9**: Rekursiv UI-komponent-resolution
4. Regressionstester

### Fas 5: Ecommerce & avancerat (3-5 dagar)

1. Implementera `ecommerce` scaffold
2. **E2+M10**: Börja med embedding-baserad KB-sökning (eller hybrid)
3. **F1**: Visa scaffold-val i builder-UI
4. Utvärdera scaffold-kvalitet med promptmatris per kategori

---

## DEL 4: Promptmatris för validering

Varje scaffold bör testas med minst 3 prompts:

| Scaffold | Testprompt 1 (SV) | Testprompt 2 (EN) | Testprompt 3 (detaljerad) |
|----------|---|---|---|
| landing-page | "Bygg en hemsida för en rekryteringsfirma" | "Create a landing page for a fitness studio" | "Build a modern landing page for a digital marketing agency with hero, services, case studies, and contact form" |
| saas-landing | "Bygg en sajt för ett projekthanteringsverktyg" | "SaaS landing page with pricing tiers and FAQ" | "Create a B2B platform marketing site with product demo video, feature comparison, pricing, and newsletter signup" |
| portfolio | "Personlig sajt för en fotograf" | "Portfolio site for a UX designer" | "Build a creative portfolio with project gallery, case study pages, about section, and contact form" |
| blog | "Blogg för ett startup" | "Tech blog with categories and newsletter" | "Build a content site with featured articles, category filtering, individual post pages, and email signup" |
| dashboard | "Adminpanel för en e-handel" | "Analytics dashboard with charts and tables" | "Build a SaaS admin dashboard with sidebar, KPI cards, revenue chart, user table, and settings page" |
| auth-pages | "Inloggningssida för en app" | "Auth pages: login, register, forgot password" | "Build authentication flow with login, registration, email verification, and password reset pages" |
| ecommerce | "Webbshop för kläder" | "Online store with product catalog and cart" | "Build an e-commerce storefront with product grid, category filtering, product detail page, and shopping cart" |

---

## DEL 5: Scaffold-implementationsguide

### Checklista per ny scaffold

1. Skapa `src/lib/gen/scaffolds/{namn}/manifest.ts`
2. Definiera manifest med:
   - `id`, `family`, `label`, `description`
   - `buildIntents`, `tags`
   - `keywords` (nytt fält för matchning)
   - `promptHints`
   - `files` med fullständig kod
3. Använd `@theme inline` i globals.css
4. Använd generiska placeholder-namn (ej hårdkodade företagsnamn)
5. Inkludera header/nav och footer för website-scaffolds
6. Registrera i `registry.ts`
7. Uppdatera `ScaffoldFamily` i `types.ts`
8. Lägg till matchningslogik i `matcher.ts`
9. Testa med minst 3 prompts
10. Kör `npx tsc --noEmit`
11. Uppdatera `docs/llm/egen-motor/scaffold-status-and-plan.md`

### Fil-riktlinjer per scaffold-typ

**Website-scaffolds** (landing-page, saas-landing, portfolio, blog):
- 5-7 filer max
- `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- `components/site-header.tsx`, `components/site-footer.tsx`
- 1-2 kategorisspecifika komponenter

**App-scaffolds** (dashboard, auth-pages):
- 5-7 filer max
- `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- `components/app-sidebar.tsx` eller `components/auth-layout.tsx`
- 1-2 kategorisspecifika komponenter

**Ecommerce**:
- 6-8 filer
- Extra: product-card, cart-drawer eller liknande

---

## DEL 6: Extern referens-mappning (Vercel Templates)

Vercel Templates-sidan visar dessa AI/ecommerce-relevanta kategorier:

| Vercel-kategori | Vår scaffold-mappning | Prioritet |
|---|---|---|
| AI (chatbot, RAG, generative UI) | Ej scaffold — applikationslogik | — |
| Ecommerce | `ecommerce` | P3 |
| SaaS | `saas-landing` | P1 |
| Blog | `blog` | P2 |
| Portfolio | `portfolio` | P1 |
| Admin Dashboard | `dashboard` | P2 |
| Authentication | `auth-pages` | P2 |
| Marketing Sites | `landing-page` | P1 |

Observera att Vercels AI-templates (chatbot, RAG, etc.) inte bör bli scaffolds — de kräver backend-setup, API-nycklar och är för specialiserade. Våra scaffolds fokuserar på visuella startpunkter, inte applikationslogik.

---

## Sammanfattning

**Kritiskt att fixa först:**
1. CSS-format (`@theme inline` överallt)
2. Scaffold-serialisering (fullständigt filinnehåll, inte bara tabell)
3. Generiska layouter (inga hårdkodade företagsnamn)
4. Matcher-tröskelvärden och substring-matchning

**Största effekt per insats:**
1. `landing-page`-scaffold (direkt kvalitetsökning för vanligaste prompts)
2. Full filinnehåll i serialisering (möjliggör edit-over-generate)
3. Per-scaffold matchning (varje scaffold matchar oberoende)
4. Scaffold-kontext i system prompt istf user message (korrekt lagerseparation)

**Total uppskattad insats:** ~3-4 veckor för alla 5 faser.
**Minimal viable förbättring:** Fas 0 + 3 scaffolds ur Fas 1 = ~1 vecka.
