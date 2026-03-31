# Storstädning: repo, kod, databas (aktiv plan)

**Ägare / process:** Denna fil styr *hur* storstädningen görs; den ersätter inte `[PROJECT-STATE-AND-DIRECTION.md](./PROJECT-STATE-AND-DIRECTION.md)` som kanonisk backlog, men **länkas därifrån** när städspåret pågår.  
**Status:** aktiv tills exit-kriterierna nedan är uppfyllda; därefter flytta till `docs/plans/avklarat/` (eller ersätt med kort rad i `avklarat/README.md`) och uppdatera `[../README.md](../README.md)`.

**Mål:** färre filer och mindre kodvägar som inte används, tydligare struktur, **utan** att tappa kanon (preview/own-engine, `src/lib/env.ts`, migreringar, tester som skyddar beteende).

**Icke-mål:** lägga backlog eller planfulltext *i* Postgres (operativ sanning för planer = **git**, se § Databas).

**Var planen hör hemma:** denna fil ligger under `docs/plans/active/` som **städ- och DB-fas-process**. Kanonisk produktbacklogg och arkitekturbeslut förblir [`PROJECT-STATE-AND-DIRECTION.md`](./PROJECT-STATE-AND-DIRECTION.md) och `docs/architecture/*`.

**Snabbläsning (~1 min):** kör smala pass enligt [Förenklad körprofil](#förenklad-körprofil-aktiv-tills-vidare) → uppdatera [pass-logg](#pass-logg-före--efter-varje-pass) → `npm run typecheck` + `npm run test:ci`. DB-fas ([Fas D](#fas-d--databas-försiktig-synk--städ--ägs-explicit-här)) **sist och separat**. Kopieringsbar startrad: [§ Handoff](#handoff-rutin-och-ny-agent-läs-före-du-fortsätter-städ).

---

## Två spår (viktigt — blanda inte ihop)

| Spår | Syfte | Typisk fråga |
|------|--------|----------------|
| **A — Städ (denna fil)** | Minska död kod, dubbla sanningar, dokumentbrus, uppenbart legacy utan reach; DB-data sist och med backup. | “Importeras detta? Finns det dubbel doc? Kan vi ta bort detta utan att bryta CI?” |
| **B — Own-engine / generation** | Vad LLM:en får för **kuraterat** material (dossiers, style packs, section packs, scaffold-metadata, promptkontext); sandbox/preview-strategi. | “Får modellen rätt signal/noise? Behöver vi bättre metadata, inte fler råfiler?” |

**Gemensam grund från extern review:** `RUNTIME_LIBRARY_MINIMUMS.localUiComponents` (t.ex. 55) i `src/lib/builder/runtime-library-audit.ts` är ett **CI-skydd för builderns lokala, kuraterade yta** (`src/components/ui/*` m.m.) — så att den ytan inte **krymper av misstag** vid refaktor. Det är **inte** ett mått på hur mycket material LLM:en har totalt, hur bra genererade sajter blir, eller hur mycket UI sandlådan kan installera via `npm`.

**Regel för städagenten:** använd **inte** `localUiComponents >= N som *huvudargument* för eller emot* own-engine:s generationskvalitet. Om en fil under `src/components/ui/` verkligen är oanvänd och ska bort, får tröskeln **justeras medvetet** i samma ändringsserie — men det beslutet är **städ/underhåll**, inte **produktstrategi för generationens korpus**.

**Regel för generationsspåret (ej denna plans ansvar ensam):** förbättring av “för lite bra material / för mycket fel kontext” drivs i **PROJECT-STATE**, builder-generation-dokument och kod under `src/lib/gen/`, `src/lib/providers/own-engine/`, scaffolds m.m. — inte genom att tolka UI-filräkning som proxy för LLM-kapacitet.

---

## Vad som ska städas respektive lämnas (översikt)

### Ska städas (inom städspåret A)

- **Död kod:** filer/barrels utan importers (grep + `tsc` + Vitest).
- **Dubbla pekare i docs:** samma sanning på fler ställen utan tydlig hierarki — konsolidera eller länka (se `documentation-lifecycle.md`).
- **`scripts/`:** entrypoints utan `package.json`-script, README eller annan dokumenterad manuell användning — ta bort eller märk deprecated.
- **Tydligt legacy med 0-reach:** efter import-graph; dokumentera i commit vad som försvann.
- **Env/policy-drift:** om en nyckel tas bort ur kod ska `env.ts` + `env-policy.json` följa med (redan princip 1).

### Ska inte städas eller kräver eget beslut (spår B eller explicit OK)

- **`src/lib/gen/scaffolds/*`, template-/reference-library, committade genererade JSON** som generationen faktiskt konsumerar — **inga** massraderingar i städpasset utan separat genomgång och tester.
- **`runtime-library-audit`-trösklar** — ändra bara som **medvetet** steg när filer faktiskt tas bort/läggs till i den kuraterade ytan; inte som surrogat för “mer LLM-material”.
- **Preview/sandbox/deploy-pipelines** — små ändringar undviks i samma svep som stor städ (se PROJECT-STATE §8).
- **Postgres-innehåll** — endast enligt [Fas D](#fas-d--databas-försiktig-synk--städ--ägs-explicit-här) med backup och miljöbesked.
- **`.cursorignore`-block** för secrets/build — inte öppna permanent “för att städa”; se befintlig § `.cursorignore` i denna fil.

### `archive/scripts-labs-testning_scarf/`

- **Git / städ:** om mappen är *tracked* och ni inte vill behålla labbet → ta bort via git/besluts-PG, inte bara ignorera.
- **`.cursorignore`:** mappen är redan avsedd att ignoreras för Cursor-index (stora outputs listas också explicit ovanför). **Behåll ignore** om ni inte aktivt vill att agenter ska semantiskt indexera labbskräp. Fixa **forward slash** i mönstret (`archive/scripts-labs-testning_scarf/`) så det följer samma stil som övriga rader.

---

## Principer

1. **En sanning per sak:** env-namn → `src/lib/env.ts`; env-klassificering → `config/env-policy.json`; arkitektur → `docs/architecture/`; backlog → `PROJECT-STATE`.
2. **Radera bara det som är verifierat oanvänt** (import-graph, grep, Vitest, ev. manuell rök i builder).
3. **Små PR:ar** i konfliktzoner (builder, stream, deploy) — se §8 i PROJECT-STATE.
4. **Databas sist i epiken** (eller i egen “release” av städen), med backup och tydlig miljö — se fas D.
5. **Enkelhet och organisering först:** ta bort mellanlager, duplicerade pekare och root-shims när direkta importer/länkar räcker; bygg inte nya meta-lager för att förklara gammal struktur.
6. **En zon i taget:** håll varje pass sammanhållet (t.ex. en barrel-familj eller en docs-nav-yta), uppdatera alla direkta referenser i samma svep och stanna där.

---

## Förenklad körprofil (aktiv tills vidare)

**Mål:** göra planen körbar även för en mindre avancerad modell, så länge passen hålls mekaniska och smala.

### Lämpliga pass för enklare modell

- **Små barrels / root-shims:** filer som bara re-exporterar vidare och har få tydliga importörer.
- **Direkta importer:** byt från mellanlager till kanonisk fil/modul när call sites är få och grep-verifierade.
- **Docs-nav / pekare:** ta bort dubbel pekning, korta ner text, länka till kanonisk fil i stället för att duplicera.
- **Skript-nav:** entrypoints med uppenbar 0-reach eller tydlig deprecate-markering.

### Inte för enklare modell just nu

- **Preview / sandbox / deploy / stream** utöver ren docs- eller importstädning runt dem.
- **`previewUrl` vs `demoUrl`** utöver att följa begreppsvakten.
- **`src/lib/gen/*` med dynamiska importer eller svår reach**, särskilt där scaffold-, prompt- eller runtimekedjor blandas.
- **LLM-/prompt-/orchestration-fokuserade worktrees eller pass:** om ytan mest handlar om promptning och modellkontext fram och tillbaka, är städ där **låg prio** i spår A; ta hellre en annan zon först.
- **Env/policy, latent infra och DB-fas** (`file-logger`, `local-engine`, `SAJTMASKIN_LOG`, `env.ts`, `env-policy.json`, Postgres-steg).
- **Allt under `src/lib/gen/scaffolds/*`** och angränsande kuraterat generationsmaterial.

### Praktisk stoppregel

- Om en kandidat inte blir tydligt verifierad med grep/importbild inom ett kort pass: **låt den vara**, uppdatera loggen och välj en enklare zon i stället.

### Commit-bredd och zoner (extern review)

Riktningen för städen bedöms som rätt (direkta importer, tydligare kanon, bättre handoff), men **breda commits** som blandar många ytor ökar risk för regress i importkedjor.

- **Föredra flera smala commits/PR:ar** framför en enda stor importrefaktor.
- **Fortsätt gärna** med små barrels och root-shims **isolat per pass** när call sites är få.
- **Blanda inte** i samma pass/commit om du kan undvika det: `src/lib/db/services/*` · `src/lib/gen/preview*` / preview-runtime · builder-hooks · `app/api`-routes — välj **en känslig zon åt gången** när importvägar ändras där.
- **Loggraden “typecheck + test:ci grönt”** i pass-loggen är **spårbarhet i git**; efter push gäller fortfarande **CI på GitHub** som separat bekräftelse (reviewern läser inte alltid check-status härifrån).

---

## Tidsuppskattning — när är vi “klara nog”?

Det finns inget exakt datum: **nöjd** = när [exit-kriterierna](#exit-kriterier-epiken-klar) nedan är uppfyllda (eller medvetet nedprioriterade och antecknade här). Grov orientering:


| Spår                                                   | Ungefärlig ansträngning                                                | Kommentar                                                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fas B (död kod, oanvända barrels, uppenbart skräp)** | **2–4 fokuserade pass** à ca 1–2 h i samma tempo som hittills          | Många “unused”-listor från verktyg är **falska positiva** (t.ex. shadcn under `src/components/ui/`). UI-filräkning + `runtime-library-audit` = **CI-vakt för builderns lokala yta**, se [Två spår](#två-spår-viktigt--blanda-inte-ihop). |
| **Duplicerad logik**                                   | **+1–2 pass** när vi hittar tydliga par *och* kan verifiera med tester | Slå ihop bara när beteendet är säkert; annars lämna.                                                                                                              |
| **Fas C (docs / skript-nav)**                          | **ca 1 pass** om målet är pekare och en sanning per ämne               | Inte “läsa om hela docs/”.                                                                                                                                        |
| **Fas D (data i Postgres)**                            | **Separat halv–heldag + backup + miljöbeslut**                         | Kodstäd och DB-städ ska inte stressas ihop.                                                                                                                       |


**Kalender:** med **sporadiska** agent-/människopass kan B+C kännas “tillräckligt rena” på **ungefär 1–2 veckor**; med **2–3 heldagar** fokuserat arbete kan samma nivå nås snabbare. **Full “inga falska positiva kvar”** är sällan värt kostnaden — då jagar man shadcn/registyret, inte produktionsrisk.

---

## Framsteg — % klart / % kvar (checklista)

**Räknegrund:** Kryssrutor i **Fas A (4)** + **Fas B (4)** + **Fas C (3)** + **Fas D data-steg (5)** + **Exit (5)** ⇒ **N = 21**. Om du lägger till eller tar bort rutor i denna fil: uppdatera **N** och första raden i tabellen.

- **% klart** = avrundat heltal: `round(100 × bockade / N)`.
- **% kvar** = `100 − % klart`.

**Viktigt:** %-värdet mäter **endast** hur många av de **21** checklistrutorna som är bockade — det är *inte* en proxy för “hur mycket kod som städats”. Faktisk barrel-/shim-flytt syns i [pass-loggen](#pass-logg-före--efter-varje-pass); när kodstäd motsvarar en färdig checklistpunkt (t.ex. nav eller döda exports-zon), ska motsvarande ruta bockas så att %-spårningen följer leveransen.

Kodstäd utan ny bock ändrar inte %-värdet; skriv då en rad i loggen under *Kod / notis* så spåret syns ändå.

**Varför %-värdet ofta “fastnar” kring hälften:** fem rutor tillhör **Fas D** (databas — körs sällan i samma svep som kodstäd), två är **exit** (DB-rad + flytta planfil), två **Fas A**-rutor är process/miljö (HEAD i PR, Postgres-URL), och **Fas B** har kvar duplicerad logik + legacy 0-reach som kräver egen verifiering. Många lyckade barrel-pass ger därför **fler loggradar** än **nya bockar** — det är väntat, inte att städspåret “stannat”.

### Pass-logg (före → efter varje pass)

**Praktik:** Många zoner får ligga i **samma PR / samma agentkörning** — tabellen är *spårbarhet*, inte ett krav på “ett pass per rad”. Samla gärna flera barrel-flyttar + en `typecheck`/`test:ci` i ett svep.

| Pass                          | Datum      | Bockade | % klart | % kvar | Kod / notis                                                                                                                                                                                                      |
| ----------------------------- | ---------- | ------- | ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inför %-spårning (retro)      | 2026-03-30 | 2/21    | 10%     | 90%    | Fas A: `typecheck` + `test:ci` redan bockade.                                                                                                                                                                    |
| **Före** pass 2026-03-31      | 2026-03-31 | 2/21    | 10%     | 90%    | —                                                                                                                                                                                                                |
| **Efter** pass 2026-03-31     | 2026-03-31 | 4/21    | 19%     | 81%    | Bock: exit “typecheck + Vitest”, Fas C skript-granskning. Kod: borttagen oanvänd barrel `src/components/ai-elements/index.ts` (importer går per-fil). Verifierat: `npm run typecheck` + `npm run test:ci` grönt. |
| **Före** pass 2026-03-31 (b)  | 2026-03-31 | 4/21    | 19%     | 81%    | —                                                                                                                                                                                                                |
| **Efter** pass 2026-03-31 (b) | 2026-03-31 | 5/21    | 24%     | 76%    | Bock: Fas B — `repo-tree.md` uppdaterad (ai-elements per-fil). Docs: ny rad i `docs/README.md` key navigation → STORDSTAD. Ingen ny kod borttagen (UI-filer = 55 st, under `runtime-library`-minimum).           |

*Nästa pass: upprepa två rader (**Före** / **Efter**) med nya siffror.*

| **Efter** pass 2026-03-31 (reviewer) | 2026-03-31 | 5/21    | 24%     | 76%    | Extern review: `src/lib/logging/file-logger.ts`, `src/lib/mcp/local-engine.ts` och `SAJTMASKIN_LOG` (policy + env-noteringar) **återställda** — latent debug/preview-infra, inte behandla som självklar barrel-skräp. Bekräftat mot `HEAD`: inga ändringar under `src/lib/gen/scaffolds/*` i samma svep. `npm run typecheck` + `npm run test:ci` grönt efter återställning. Arbetsträd kan fortfarande blanda städ med andra ändringar — separera commit eller lista `git diff --name-only` tydligt i PR. |
| **Före** pass 2026-03-31 (c)  | 2026-03-31 | 5/21    | 24%     | 76%    | Zon: root-shims för `shadcn`-registry och förtydligande av `previewUrl` vs `demoUrl` i styrdocs före fortsatt städ. |
| **Efter** pass 2026-03-31 (c) | 2026-03-31 | 5/21    | 24%     | 76%    | Kod: borttagna redundanta root-shims `src/lib/shadcn-registry-{utils,cache,service}.ts`; call sites pekar nu direkt på `src/lib/shadcn/*`. Docs: `AGENTS.md` + denna plan förtydligar `previewUrl` (publikt) vs `demoUrl` (legacy/intern) och ledorden enkelhet/zonpass. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Bekräftat: inga ändringar under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (d)  | 2026-03-31 | 5/21    | 24%     | 76%    | Mål: göra planen lättare att köra med mindre modell och fortsätta med små barrels med få importörer. |
| **Efter** pass 2026-03-31 (d) | 2026-03-31 | 5/21    | 24%     | 76%    | Docs: ny sektion “Förenklad körprofil” som parkerar svåra zoner och styr enklare pass mot små barrels/root-shims/docs-nav. Kod: borttagna barrels `src/lib/backoffice/index.ts`, `src/lib/storage/index.ts`, `src/components/auth/index.ts`, `src/components/templates/index.ts`; call sites pekar nu direkt på kanoniska filer. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Bekräftat: inga ändringar under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (e)  | 2026-03-31 | 5/21    | 24%     | 76%    | Planen kändes tung; förenkla navigering + en barrel till. |
| **Efter** pass 2026-03-31 (e) | 2026-03-31 | 5/21    | 24%     | 76%    | Docs: “Snabbläsning” överst; `.cursorignore`-avsnittet kortat (pekar på `repo-env-indexing.mdc`). Kod: borttagen `src/lib/entry/index.ts`; `page.tsx` importerar `@/lib/entry/use-entry-params`; `ENTRY-SYSTEM.md` pekar `@/lib/entry/entry-token`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. |
| **Före** pass 2026-03-31 (f)  | 2026-03-31 | 5/21    | 24%     | 76%    | Parallell sondering: nästa små barrels (hooks/chat, audit). |
| **Efter** pass 2026-03-31 (f) | 2026-03-31 | 5/21    | 24%     | 76%    | Kod: borttagna `src/lib/hooks/chat/index.ts` och `src/components/audit/index.ts`; `useBuilderPageController` → `@/lib/hooks/chat/useChatMessaging`; `audit-modal` importerar audit-komponenter per-fil. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. |
| **Före** pass 2026-03-31 (g)  | 2026-03-31 | 5/21    | 24%     | 76%    | Zon: `gen/context`, `components/modals`, `components/media` — barrels med få importörer. |
| **Efter** pass 2026-03-31 (g) | 2026-03-31 | 5/21    | 24%     | 76%    | Kod: borttagna `src/lib/gen/context/index.ts`, `src/components/modals/index.ts`, `src/components/media/index.ts`; call sites pekar på `file-context-builder`, modals per-fil, `file-upload-zone` / `media-drawer` / `text-uploader`. Vitest-mock uppdaterad till `@/lib/gen/context/file-context-builder`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (h)  | 2026-03-31 | 5/21    | 24%     | 76%    | Förtydliga %-mätning vs leverans; bocka färdiga checklistdelar; ta bort `layout`- och `preview-session`-barrels. |
| **Efter** pass 2026-03-31 (h) | 2026-03-31 | 8/21    | 38%     | 62%    | Docs: denna fil förklarar nu skillnad checklist-% vs kodvolym; `docs/README.md` länkar STORDSTAD under aktiva planer. Bock: Fas B (döda exports-zon för små barrels/root-shims enligt logg a–h), Fas C (nav/pekare), exit-ruta docs-nav. Kod: borttagna `src/components/layout/index.ts`, `src/lib/builder/preview-session/index.ts`; 11 app-sidor + builder-hooks importerar kanoniska layout-/preview-session-filer. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (i)  | 2026-03-31 | 8/21    | 38%     | 62%    | Zon: `gen/suspense` barrel (endast `route-helpers`); bocka arkiv/exit-nedprioritering där processen är dokumenterad. |
| **Efter** pass 2026-03-31 (i) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen `src/lib/gen/suspense/index.ts`; `createDefaultRules` / `createDefaultSuspenseTransform` i `default-rules.ts`; `route-helpers` importerar `transform` + `default-rules`. Bock: Fas C (arkivpolicy), exit “Fas A–D … nedprioriterade” med § nedan. `HEAD` vid verifiering: `436395ab98afba32d3aca00fb1af615cf0309e68`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (j)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `gen/security` — barrel med endast `autofix/pipeline` som importör av `runSecurityChecks`. |
| **Efter** pass 2026-03-31 (j) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen `src/lib/gen/security/index.ts`; `runSecurityChecks` + `SecurityCheckResult` i `run-security-checks.ts`; `pipeline.ts` importerar `../security/run-security-checks`. Övriga consumers använder redan `./security/path-validator` direkt. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Efter** bulk-pass 2026-03-31 (k) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagna `src/lib/db/services/index.ts` och dublett-shim `src/lib/db/services.ts`; ~45 call sites + Vitest-mocks pekar på `@/lib/db/services/<modul>`. `stream/route.test.ts`: `vi.mock(@/lib/config)` utökad med `SECRETS`/`PATHS` så `shared.ts` kan laddas vid indirekta kedjor. Docs: `repo-tree.md` (DB-zon + importmönster) uppdaterad. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (l)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `src/lib/gen/preview/index.ts` som barrel för preview-HTML, URL-hjälpare, typer och re-exports. |
| **Efter** pass 2026-03-31 (l) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen `src/lib/gen/preview/index.ts`; `buildPreviewHtml` / `buildSandboxFiles` / `buildPreviewUrl` i `build-preview-document.ts`; URL-helpers → `preview/legacy/compatibility-shim`; preflight-typer → `stream/preflight-contract`; sandbox API-typer → `preview-contract`. Interna grepp + Vitest-mocks uppdaterade; `legacy/README.md` beskriver nya sökvägar. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (m)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `src/lib/templates/index.ts` som barrel för `template-data` + `template-catalog`. |
| **Efter** pass 2026-03-31 (m) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen `src/lib/templates/index.ts`; fyra call sites → `template-data` / `template-catalog` direkt. `PROJECT-STATE` uppdaterad (importmönster). Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (n)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: liten preview-helper-städning + skriv in regel att LLM-/prompt-worktrees kan lämnas ostädade i spår A. |
| **Efter** pass 2026-03-31 (n) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: `sandbox-preview` re-exporterar inte längre `httpStatusForSandboxPreviewFailure`; sandbox-preview-route importerar nu helpern direkt från `sandbox-preview-errors`. Docs: “Förenklad körprofil” + handoff förtydligar att LLM-/prompt-/orchestration-tunga worktrees/pass får lämnas ostädade när spår A annars kan hållas renare. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (o)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `route-helpers` — oanvänd re-export av `formatSSEEvent` (alla call sites redan `@/lib/streaming`). |
| **Efter** pass 2026-03-31 (o) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen död re-export `formatSSEEvent` ur `src/lib/gen/route-helpers.ts`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (p)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `preview-session/telemetry.ts` + `preview-session/types.ts` som tunna re-exporter mot `gen/`. |
| **Efter** pass 2026-03-31 (p) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagna shims; `api.ts` → `@/lib/gen/preview-contract`; `useSandboxPreviewSession` / `useBuilderSandboxPreview` → `@/lib/gen/sandbox-lifecycle-telemetry`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (q)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: `components/builder/preview-panel/index.tsx` barrel (2 importörer). |
| **Efter** pass 2026-03-31 (q) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen barrel; `BuilderShellContent` + `PreviewPanel.test.tsx` importerar `./PreviewPanel` / `@/components/builder/preview-panel/PreviewPanel`. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (r)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: root-shim `src/lib/shadcn-registry-types.ts` (4 importörer). |
| **Efter** pass 2026-03-31 (r) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen shim; builder-pickers + `prompt-builder` importerar `@/lib/shadcn/registry-types` direkt. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (s)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: dubbel importväg för `cn` — `@/lib/utils/utils` (12 filer) vs kanon `@/lib/utils`. |
| **Efter** pass 2026-03-31 (s) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: `ai-elements`, `media`, `layout/shader-background` importerar `cn` från `@/lib/utils` (samma re-export mot `utils/utils`). Inget kontrakts- eller DB-steg. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (t)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: oanvänd legacy-export `isDebugEnabledLegacy` i `utils/debug.ts`. |
| **Efter** pass 2026-03-31 (t) | 2026-03-31 | 10/21   | 48%     | 52%    | Kod: borttagen alias-export; `isDebugEnabled` kvar. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (u)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: skript-nav — delade `scripts/*.ts` utan tydlig README-pekare i översikten. |
| **Efter** pass 2026-03-31 (u) | 2026-03-31 | 10/21   | 48%     | 52%    | Docs: `scripts/README.md` översikt pekar ut `template-library-discovery.ts` + `scaffold-candidate-report.ts` och vilka entrypoints som importerar dem. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |
| **Före** pass 2026-03-31 (v)  | 2026-03-31 | 10/21   | 48%     | 52%    | Zon: oanvända re-export-rader (ingen ny publik yta); Fas A massradering-HEAD som process i cursor-regel. |
| **Efter** pass 2026-03-31 (v) | 2026-03-31 | 11/21   | 52%     | 48%    | Kod: borttagna döda `export { … }` i `orchestrate.ts` (`GenerationInputPackage`), `visual-qa.ts` (`PASS_THRESHOLD`, `MAX_DESIGN_PATCH_ATTEMPTS`), `load-manifest.ts` (`buildProfileIdSchema`, `qualityLevelSchema`) — inga externa importörer. Docs/process: `.cursor/rules/session-git-docs.mdc` — vid massradering, nämn `git rev-parse HEAD` i PR (länk STORDSTAD Fas A). Bock: Fas A ruta 3. Verifierat: `npm run typecheck` + `npm run test:ci` grönt. Inget under `src/lib/gen/scaffolds/*`. |

---

## Handoff-rutin och ny agent (läs före du fortsätter städ)

### Efter varje städpass (människa eller agent)

1. **Uppdatera pass-loggen** ovan med **Före** / **Efter** (datum, ev. nya bockar → uppdatera %-raden om N ändrats).
2. **Kör** `npm run typecheck` och `npm run test:ci`; notera i loggrad om något är rött. Efter push: lita på **GitHub Actions** som slutlig signal, inte bara på loggtext.
3. **Konfliktzon-check:** om du rört builder/stream/deploy/gen — nämn det i logg eller PR; undvik att blanda massstäd där utan separat PR (se `PROJECT-STATE` §8).
4. **`src/lib/gen/scaffolds/*`:** ingen massradering eller “städ” där i samma pass som repo-städ; vid minsta ändring: motivera + tester.
5. **Arkiv:** när en *del* av planen är historisk (t.ex. avslutad delspår), flytta till `docs/plans/avklarat/` och uppdatera [`../README.md`](../README.md) — duplicera inte samma sanning i två aktiva filer.
6. **Commit-bredd:** en logisk zon per commit när möjligt; separera `db/services`, preview och builder/API enligt [§ Commit-bredd och zoner](#commit-bredd-och-zoner-extern-review) — särskilt efter stora svep som `d554dea63c2fc3b36eb09d8e4361097d26caeff8`.
7. **LLM-/prompt-worktrees:** om ett parallellt worktree/pass mest bär promptkedja, orchestration eller modellkontext, behöver spår A inte “städa ikapp” där; prioritera andra repo-zoner först.

### Särskild granskning före borttagning (inte “bara skräp”)

| Sökväg | Varför |
|--------|--------|
| `src/lib/logging/file-logger.ts` | Filbaserad logg styrd av `SAJTMASKIN_LOG=true` (`logs/sajtmaskin.log`). Kan vara 0-reach i import-graph men är avsedd som **valfri** debug-yta. |
| `src/lib/mcp/local-engine.ts` | Helper-yta för preview/runtime kring genererade filer; kan vara latent utan direkta importers. |
| `SAJTMASKIN_LOG` | Ska finnas i `config/env-policy.json` (`runtimeOnlyKeys`) och vara dokumenterad i `docs/development/env-comparison-notes.md` / kort i `docs/ENV.md` om policyn ändras. |

Ta bort dessa **bara** efter uttryckligt beslut + diff i PR, inte som del av “barrelsweep”.

### Begreppsvakt: `previewUrl` vs `demoUrl`

- **Publikt API/SSE:** `previewUrl` är kanoniskt svarsfält — se `src/lib/api/preview-url-contract.ts` och `docs/plans/avklarat/KORPLAN-preview-url-api.md`.
- **Legacy/intern naming debt:** `demoUrl` finns kvar i `demo_url` / `versions.demoUrl`, inbound payloads och vissa interna typer/transkript.
- **Städregel:** behandla därför inte `demoUrl`-träffar som automatisk död kod eller enkel rename i spår A. Om du uttryckligen rör preview-/API-kontraktet: scopea det separat från massstäd.

### Startrad till ny LLM (kopiera hela blocket nedan)

```text
Du fortsätter storstädningsspår A i Sajtmaskin enligt docs/plans/active/STORDSTAD-repo-kod-databas.md (läs hela filen, särskilt § Två spår, Fas B–C, .cursorignore och § Handoff-rutin).

Kontext: Fas A baseline och delar av Fas B/C är påbörjade; pass-loggen visar senaste läget. `file-logger.ts`, `local-engine.ts` och SAJTMASKIN_LOG är medvetet kvar som latent infra — radera dem inte utan explicit beslut. Publika API/SSE-svar använder `previewUrl`; `demoUrl` finns kvar som legacy i inbound payloads, vissa interna typer och DB-namn. Gör ingen blanket-rename av detta i städspåret.

Gör så här:
1. Läs AGENTS.md + docs/README.md (nav) och repo-tree.md om du behöver orientering.
2. Arbeta zon-för-zon: grep/import-graph, ta bara bort det som är verifierat oanvänt; börja gärna med “Förenklad körprofil” (små barrels/root-shims/docs-nav) och undvik src/lib/gen/scaffolds/* och preview/deploy-pipelines i samma svep som massstäd. Om worktreet mest gäller LLM/prompt/orchestration: hoppa gärna över städ där och ta en annan zon.
3. Håll nästa pass **smalt**: blanda inte db/services-, preview- och builder/API-zoner i samma commit om du kan undvika det (se § “Commit-bredd och zoner” i STORDSTAD).
4. Om du tar bort filer under src/components/ui/, justera RUNTIME_LIBRARY_MINIMUMS i runtime-library-audit.ts medvetet i samma PR om CI kräver det.
5. Efter ändringar: npm run typecheck && npm run test:ci; efter push ska GitHub CI bekräfta.
6. Uppdatera STORDSTAD pass-logg (Före/Efter) och eventuella checklistrutor; om något arkiveras, flytta till docs/plans/avklarat/ och uppdatera plans/README.md.

Leverera: kort sammanfattning av vad som ändrats, eventuellt git diff --name-only om allt ligger i samma working tree, och bekräftelse att scaffolds/ inte rörts om du lovat det.
```

---

## Fas A — Baseline (innan radering)

- [x] `npm run typecheck`
- [x] `npm run test:ci` (Vitest; motsvarar bred `vitest run` i CI-läge)
- [x] Notera nuvarande `git rev-parse HEAD` i PR-beskrivning om ni gör massradering *(2026-03-31: process i [`.cursor/rules/session-git-docs.mdc`](../../../.cursor/rules/session-git-docs.mdc) — massradering / bred städ-PR)*
- [ ] Bekräfta **vilken Postgres-URL** som gäller för nästa steg (lokal dev vs staging); **aldrig** anta prod utan explicit beslut

**Insyn utan skrivning:** `npm run db:rows` (`[scripts/db-row-overview.mjs](../../../scripts/db-row-overview.mjs)`) — räknar rader per utvald tabell om `POSTGRES_URL` finns i `.env.local`. Används för att avgöra om legacy-tabeller är tomma innan städ; ersätter inte backup eller manuellt miljöbeslut (fas D).

---

## Fas B — Kod och moduler (grep + import)

- [x] Döda exports / oanvända filer — **små barrels & root-shims** *(2026-03-31: zonpass enligt [pass-logg](#pass-logg-före--efter-varje-pass) (a)–(h), (i)–(j), bulk (k) (`db/services` + shim `db/services.ts`), (l) (`gen/preview/index` bort), (m) (`lib/templates/index` bort): rena re-export-barrels bort; kvar under samma rubrik: bredare oanvända helpers, `src/components/ui/`-tröskel-justeringar, större refaktorer — se [Två spår](#två-spår-viktigt--blanda-inte-ihop).)*
- [ ] Duplicerade helpers: slå ihop endast när tester finns eller beteende är trivialt identiskt
- [ ] Legacy-grenar som grep/typecheck visar som 0-reach (dokumentera i commit *vad* som togs bort)
- [x] Uppdatera [`docs/architecture/repo-tree.md`](../../architecture/repo-tree.md) när toppnivåmappar försvinner eller byter roll *(2026-03-31: `ai-elements` per-fil + DB-zon beskriver `db/services/*` utan barrel; inga rotmappar borttagna)*

---

## Fas C — Dokumentation och skript

- [x] En nav/pekare per ämne (undvik parallella “nya sanningar” i samma fil — se `documentation-lifecycle.md`) *(2026-03-31: `docs/README.md` “Aktiva planer” pekar uttryckligen på STORDSTAD + befintlig plans/README / PROJECT-STATE; fortsatt policy = länka kanon, duplicera inte fulltext.)*
- [x] Arkiv: flytta färdig historik till `avklarat/`, inte duplicera i `active/` *(2026-03-31: [`plans/README.md`](../README.md) skiljer `active/` vs `avklarat/` med pekare; ingen dubbel STORDSTAD-kopia i `avklarat/` medan epiken pågår — pass-logg i denna fil är *en* aktiv historik, inte parallell kanon.)*
- [x] Skript under `scripts/`: ta bort eller markera deprecated om inga `package.json`-scripts refererar dem *(2026-03-31: zon granskad; inga orphan-entrypoints som saknar `package.json`/`scripts/README`/e2e — inget att radera i detta pass)*

---

## Fas D — Databas (försiktig synk / städ) — **ägs explicit här**

**Vad “synk” *inte* är:** att skriva planmarkdown eller backlog-rader till Postgres. Appens DB håller **appdata** (projekt, chats, versioner, m.m. enligt `src/lib/db/schema.ts`).

**Vad “synk” *är* i praktiken:**

1. **Schema-läge:** `npm run db:push` / migreringar enligt teamets vanor ska matcha `[src/lib/db/schema.ts](../../../src/lib/db/schema.ts)` och Drizzle — ingen “manuell drift” utan kodändring.
2. **Data-läge (MVP / dev / staging):** om ni medvetet vill **tömma testdata**:
   - [ ] **Backup** (Supabase snapshot, `pg_dump`, eller separat dev-instans som får offras)
   - [ ] Bekräfta miljö: endast `.env.local` / staging-URL — **skriv aldrig** `TRUNCATE` mot prod i blindo
   - [ ] Dokumentera ordning (FK): antingen dedikerat skript i `scripts/` (ny fil vid behov) *eller* Supabase SQL editor med review
   - [ ] Efter tömning: `npm run db:init` om ni återskapar schema från scratch; annars bara rensad data
   - [ ] Rök: `npm run db:check` ([`scripts/check-dev-db.mjs`](../../../scripts/check-dev-db.mjs)), logga in i appen, skapa ett minimalt projekt/chat
3. **Prod:** endast schema/migrationer + observerad drift — **ingen** “rens allt” utan incident/change-protokoll.

**Leverans:** när fas D är klar ska det finnas **en commit eller PR** som nämner: miljö, backup, skript/SQL-sökväg, och verifieringssteg.

---

## `.cursorignore`

**Kort:** öppna inte permanent ignores för `.env*`, build-cache eller hemligheter “för att städa index”. Använd `repo-tree.md` + denna plan för orientering i stället. **Kanonical policy:** [`.cursor/rules/repo-env-indexing.mdc`](../../../.cursor/rules/repo-env-indexing.mdc) (ignorerade sökvägar, scratch-mappar, tillfällig undantags-PR).

---

## Nedprioriterade delar

*(Räknas som “antecknat” för exit-rutan **Fas A–D genomförda eller nedprioriterade**.)*

- **Fas D (Postgres-data):** Körs **inte** i barrel-pass; kräver backup, miljöbeslut och egen PR enligt [Fas D](#fas-d--databas-försiktig-synk--städ--ägs-explicit-här).
- **Fas A ruta 3 (massradering HEAD):** Bockad 2026-03-31; process i `.cursor/rules/session-git-docs.mdc` (länk till denna plans Fas A).
- **Fas A ruta 4 (Postgres-URL):** Bekräftas alltid före schema/data-steg — uppdatera inte denna fil med rullande `git rev-parse HEAD` som “sanning”; exempelreferens vid tidigare pass: `436395ab98afba32d3aca00fb1af615cf0309e68`.
- **STORDSTAD-filens livscykel:** Så länge städspåret är aktivt ligger planen kvar i `active/`; när [exit nedan](#exit-kriterier-epiken-klar) är uppfyllt flyttas filen till `avklarat/` per befintlig katalogpolicy.

## Exit-kriterier (epiken klar)

- [x] Fas A–D genomförda eller medvetet nedprioriterade (antecknat i denna fil) *(2026-03-31: D och delar av A enligt § [Nedprioriterade delar](#nedprioriterade-delar) ovan; B/C-spår fortsätter i löpande PR tills sista exit-rutor är gröna.)*
- [x] `typecheck` + överenskommen Vitest-nivå grönt *(standard: `npm run typecheck` + `npm run test:ci`; senast verifierat 2026-03-31 pass v)*
- [x] `repo-tree.md` / `docs/README.md` pekar rätt om strukturen ändrats *(2026-03-31: README nav uppdaterad för aktiv storstäd; repo-tree redan i linje med importmönster — uppdatera vid framtida rot-/mappbyten.)*
- [ ] Databas: schema OK + dokumenterad dataåtgärd om sådan utförts
- [ ] Flytta denna fil till `avklarat/` och uppdatera [`../README.md`](../README.md)

---

## Relaterat

- `[documentation-lifecycle.md](../../architecture/documentation-lifecycle.md)`  
- `[PROJECT-STATE-AND-DIRECTION.md](./PROJECT-STATE-AND-DIRECTION.md)` §5 (massstädning), §8 (konfliktrisk)  
- `[docs/ENV.md](../../ENV.md)`

