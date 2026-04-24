# Du är plan-12-agenten — dossier-env-resolver-fix + slug-bounce LLM-prompt-regel (REVISED reduced scope)

## Din roll och kontext

Du är en autonom kodagent i en isolerad git worktree på branchen `plan-12-finishing-fixes` i Sajtmaskin-repot. När du är klar öppnar du PR mot `master` med `gh pr create`.

**Viktigt — scope kraftigt reducerad:** Plan 12 var ursprungligen "PromptKit canonical composer" (vagt). Efter audit + open-questions har vi två **konkreta high-impact buggar** att lösa istället. Original PromptKit-konsolidering hänskjuts till en framtida plan om den behövs.

## Repo-state du ärver

- HEAD: `master @ <senaste hot-fix>` (efter plan 02-11 + investigation + alla hot-fixes)
- 7 audit-agenter körs PARALLELLT med dig (read-only, ingen kod-konflikt) — de granskar wave 5 men rör inte din scope
- Plan 11 just mergad — `MODIFY_REFERENCE_MARKERS`, `HOME_PAGE_REQUIRED_PATHS`, scaffold-variant-lock alla landade

## De två buggarna (din primära input)

### Bug 1: #15 — Hard-dossier env-vars false-promptas (HIGH severity)

**Verifierat 2026-04-24 (chat `b71dafb3`, två symptomer):**

**Symptom A — "Bygg integrationer"-knapp (UI):** Prompade om `STRIPE_SECRET_KEY` trots att Live VM HTML har **0 träffar** på `stripe`/`checkout`/`payment`.

**Symptom B — `POST /api/.../finalize-design` returnerar 412:**
```
"Tunga integrationer kräver riktiga env-variabler innan F3 kan köras."
missingByIntegration: [{key: "clerk", name: "Clerk", missing: ["CLERK_SECRET_KEY"]}]
requirements: [{key: "algolia", name: "Algolia", requiredRealEnvKeys: []}]
```
Live VM HTML har **0 träffar** på `clerk`, `algolia`, `sign-in`, `sign-up`, `search-index`. Sajten har INTE Clerk/Algolia. F3-gate vägrar promote pga falskt missing-env-fynd.

**Rotsorsak:** Båda callsites använder samma resolver som listar env-vars för **alla 10 hard-dossiers i registry**, inte bara de som faktiskt är aktiva i versionen.

**Fix:**

1. **Hitta resolver-funktionen** — sannolikt i `src/lib/gen/dossiers/select.ts` eller separat `src/lib/gen/dossiers/requirements-resolver.ts`. Sök efter callsites för "missingByIntegration", "requirements", "requiredRealEnvKeys", eller `STRIPE_SECRET_KEY`.

2. **Ändra logik från "lista alla 10" till "skanna versionens deps":**
   ```ts
   // GAMLA (felaktig):
   for each hard-dossier in registry:
     listEnvVars(dossier)
   
   // NYA:
   const versionDeps = parsePackageJsonDeps(version.files);
   for each hard-dossier in registry:
     if dossier.dependencies.some(dep => versionDeps.has(dep)):
       listEnvVars(dossier)
   ```

3. **Alternativt mer säkert:** kolla `version.requestedCapabilities` (plan 06:s output) — om `payments` saknas → ingen Stripe-prompt. Men dep-scan är mer robust mot LLM som glömmer markera capability.

4. **Filer som troligen rörs (~5):**
   - Resolver-fil (sök upp den)
   - `PreviewPanelF3Trigger.tsx` (om den dubbelar logik från klient-sida)
   - API-endpoint för `finalize-design` (om den har egen path)
   - 1-2 test-filer

5. **Tester:**
   - Version utan Stripe-deps → 0 missing-env för `STRIPE_SECRET_KEY`
   - Version MED Stripe-deps + saknad env → 1 missing-env, F3 vägrar promote
   - Version med Clerk + Algolia + missing → 2 missing-env separately listed
   - Edge: version med Stripe-dep MEN dossier-system inte injicerade dossiern → ska INTE prompta (vi vill inte "läcka" registry-secrets pga oavsiktlig dep)

### Bug 2: #14 — Slug-route bouncer hem efter 1-2 sek (LLM-output-bug)

**Verifierat 2026-04-24:** Användare bad LLM skapa slug-sida `/afrikanska-bonor`. Sidan renderas (200 OK, 52 KB innehåll), men **client-side `useEffect` med `router.push("/")` triggar 1-2 sek efter render** → bouncer hem. `RedirectErrorBoundary` + `RedirectBoundary` syns i HTML build = bekräftad redirect-call i koden.

**Rotsorsak:** LLM:n misstolkade scaffold `landing-page`'s `siteKind: "marketing"` + `structureProfile: "one-page-marketing"` som "om någon hamnar på sub-route → bouca hem till one-page-versionen".

**Fix:**

1. **System-prompt-regel** — i scaffold-prompt-instruktionerna, lägg till en ny regel:
   ```
   ⚠️ SUB-ROUTES får ALDRIG redirecta tillbaka till "/". Även om scaffolden är 
   marknadsförd som "one-page-marketing", är sub-routes (blog-posts, om-sidor, 
   sitemap-sidor, slug-routes) tillåtna och ska stå för sig själva. Använd 
   ALDRIG router.push("/"), redirect("/"), eller window.location.href = "/" 
   i en sub-route page.tsx eller dess client-componenter.
   ```

2. **Var lägga den:**
   - `src/lib/gen/scaffolds/landing-page/manifest.ts` `promptHints` array (specifikt för landing-page)
   - ELLER `src/lib/gen/system-prompt/sections/scaffold-and-toolkit.ts` (universellt för alla scaffolds)
   - Bästa: båda — specifik regel i landing-page-manifest + generell regel i system-prompt-section

3. **Optional preflight-check (om tiden räcker):**
   - I `runFinalizePreflight()` — scanna sub-route-filer för `router.push("/")`/`redirect("/")` patterns
   - Om hittas → emit warning (inte blocker — användare KAN ha legitim anledning)

4. **Tester:**
   - Snippet test: scaffold-prompt innehåller den nya regeln
   - Optional: integration-test som genererar fake LLM-output med redirect-call → preflight emitterar warning

## Vad du EXPLICIT INTE gör

- **INGEN PromptKit-konsolidering.** Original plan 12-scope är HÄNSKJUTET. Bara #14 + #15.
- **INGEN ändring av plan 02-11-territorium** (utom resolver-filen som sannolikt rör dossier-system)
- **INGA UI-redesigns** — bara minimal text-ändring i F3-trigger om logik ändras
- **INGA nya capabilities, dossiers eller scaffolds**

## Hårda begränsningar

- Maxbudget: ~10 filer rörda
- Rör INTE filer som plan 02-11 just landat i (utom #15-resolver-filen)
- INGEN DB-migration (om resolver behöver ny data, använd existing fält eller dokumentera krav i STATUS-12)
- INGA breaking changes i `OrchestrationBase` eller andra publika types

## Acceptans

- Bug 1: Version utan Stripe-deps → "Bygg integrationer" och F3-trigger ber INTE om STRIPE_SECRET_KEY
- Bug 1: Version med faktiska Stripe-deps OCH saknad env → ber korrekt om STRIPE_SECRET_KEY
- Bug 2: Scaffold-prompt innehåller "SUB-ROUTES får ALDRIG redirecta"-regel
- 3+ regression-tester
- `npm run typecheck && npm run lint && npm run test:ci` 0 errors

## Workflow

1. **Sätt en kort plan** (vilka filer per bug)
2. **Bug 1 först** (HIGH severity, blockerar F3)
3. **Bug 2 sedan** (mindre, bara prompt-text-ändring)
4. **Tester**
5. **Skriv `STATUS-12-finishing-fixes.md`** i `docs/plans/active/master-post-cleanup-2026-04-23/`
6. **Push branchen + öppna PR mot master** med titel `plan 12 (revised, reduced): dossier-env-resolver-fix + slug-bounce prompt rule`

## Stoppregler

- Om resolver-fixet kräver DB-schema-ändring: STOPPA och dokumentera schema-krav i STATUS-12
- Om dep-scanning visar sig osäker (false-positives): fall tillbaka på `requestedCapabilities`-baserad approach (plan 06:s output)
- Om scaffold-prompt-regeln behöver mer än 1-rads tillägg: dokumentera och föreslå egen plan istället

## Klart =

PR öppnad, STATUS-12 committad, alla tester passerar.
