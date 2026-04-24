# STATUS-12 finishing fixes — dossier-env-resolver + slug-bounce prompt rule

**Datum:** 2026-04-24
**Branch:** `plan-12`
**Scope (revised, reduced):** två konkreta high-impact buggar identifierade i wave-5-audit + open-questions #14 och #15. Original PromptKit-konsolidering hänskjuten.

## Buggar adresserade

### #15 — Hard-dossier env-vars false-promptas (HIGH severity)

**Repro chat `b71dafb3` (2026-04-24):**

| Symptom | Före | Efter |
|---|---|---|
| F3-trigger ("Bygg integrationer") | 412 `Tunga integrationer kräver riktiga env-variabler` med `missingByIntegration: [{key:"clerk", missing:["CLERK_SECRET_KEY"]}]` trots 0 träffar på `clerk` i live-VM | Slug-only chat → readiness ready=true, F3-trigger startar utan env-prompt |
| Readiness-card | Blockerade på STRIPE_SECRET_KEY för landningssidor utan Stripe-kod | Inga falska blockers; orphan-detekteringar surface:as som warn-only info |

**Rotsorsak:** `applyEnforcementOverlay` i `src/lib/gen/detect-integrations.ts` defaultade alla envEnforcement-tomma keys till `"build"`. När `detectIntegrations` matchade en regex (t.ex. en orphan `@clerk/nextjs`-import som LLM:n lämnat efter sig, eller en phantom dep i `package.json`) men ingen vald dossier matchade integrationen → varje key behandlades som F2/F3-blocker.

`tier3-build-spec.ts`:s dossier-backing-clamp använde redan `getAllDossiers()` (alla 10 hard-dossiers på disk) och kunde därför aldrig downgrada en registry-detected integration — alla matchades alltid mot någon registry-entry.

**Fix:** En enda surgical change i `applyEnforcementOverlay`:

```ts
const integrationHasNoBacking =
  selectedDossiersProvided && !cluster && integration.key !== "custom-env";
const unbackedFallback: DossierEnvVarEnforcement = integrationHasNoBacking
  ? "warn-only"
  : "build";
```

Plus byte av truthiness-check (`length > 0` → `!== undefined`) så att en snapshot som resolverar till `selectedDossiers: []` (slug-only chat utan kapabiliteter) ändå räknas som "snapshot resolved" och triggar warn-only-defaulten.

**Konsekvens:**

| Scenario | Detektion | Cluster | Fallback | Beteende |
|---|---|---|---|---|
| Stripe selected + Stripe-kod | Stripe | matchar | cluster's enforcement | Build (blockerar korrekt) |
| Inget selected + orphan Stripe-import | Stripe | ingen | warn-only (ny default) | Surface som info, blockerar inte |
| Slug-chat (selectedDossiers: []) + phantom @clerk dep | Clerk | ingen | warn-only (ny default) | Inga F3-prompts |
| Legacy caller (ingen selectedDossiers) | Stripe | n/a | build (oförändrat) | Pre-plan-12 beteende bevarat |
| Custom-env spillover (process.env.X) | custom-env | n/a | build (alltid) | Användarens egna keys behandlas konservativt |

### #14 — Slug-route bouncer hem efter 1-2 sek (LLM-output-bug)

**Repro:** Användare bad LLM skapa `/afrikanska-bonor`. Sidan renderade (200 OK, 52 KB) men `useEffect` med `router.push("/")` triggade efter mount → bouncer hem. LLM:n misstolkade `landing-page`-scaffoldens `structureProfile: "one-page-marketing"` som "alla sub-routes ska funnel:a tillbaka till one-page-versionen".

**Fix:** Promptlager (två lager för defense-in-depth):

1. **Specifikt** i `src/lib/gen/scaffolds/landing-page/manifest.ts` `promptHints` — sub-route-regeln läggs in just där LLM:n ser scaffold-rationalet, så missförståndet adresseras vid samma plats där det uppstår.
2. **Generellt** i `src/lib/gen/system-prompt/sections/route-plan.ts` — under "Hard rules for navigation expressions" som syns i alla scaffolds med `routePlan.routes.length > 0`. Förbjuder `router.push('/')`, `redirect('/')`, `window.location.href = '/'` i sub-route-kontext.

Inga preflight-checks tillagda (skulle kräva mer scope och risk för false-positives — promptregeln räcker som första skikt).

## Filer

| Fil | Ändring |
|---|---|
| `src/lib/gen/detect-integrations.ts` | `applyEnforcementOverlay`: ny `unbackedFallback`-logik + `selectedDossiersProvided`-semantik (`!== undefined`) |
| `src/lib/gen/detect-integrations.test.ts` | Uppdaterad test "downgrades to warn-only" + 2 nya tester (slug-only chat, legacy back-compat) |
| `src/lib/integrations/tier3-build-spec.test.ts` | Ny end-to-end-test som verifierar att upstream warn-only envEnforcement propagerar genom `deriveTier3BuildSpec` + `validateTier3Readiness` |
| `src/lib/gen/scaffolds/landing-page/manifest.ts` | Ny `promptHints`-rad om sub-route-no-redirect |
| `src/lib/gen/system-prompt/sections/route-plan.ts` | Ny bullet under "Hard rules for navigation expressions" |
| `src/lib/gen/system-prompt.test.ts` | Utökad test för canonical-route-paths-block: assertar att sub-route-regeln syns i prompt |
| `src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts` | Ny test som låser fast att landing-page-manifestet innehåller sub-route-promptHint |

**7 filer rörda** (under 10-fils-budget).

## Tester

```
npx vitest run \
  src/lib/gen/detect-integrations.test.ts \
  src/lib/integrations/tier3-build-spec.test.ts \
  src/lib/gen/scaffolds/scaffold-manifest-validation.test.ts \
  src/lib/gen/system-prompt.test.ts
```

→ 4 testfiler, 46 tester gröna.

`npm run typecheck` → 0 errors. `npm run lint` → 0 errors. `npm run test:ci` → 220 testfiler, 1613 tester gröna.

## Vad som EXPLICIT inte gjordes

- **Ingen PromptKit-konsolidering** — original plan-12-scope hänskjuten till framtida plan om det blir aktuellt.
- **Ingen preflight-scan** för `router.push("/")`-mönster i sub-routes (skulle dubbla scope och kunna trigga false-positives på legitima auth-redirect-flöden).
- **Inga ändringar i `tier3-build-spec.ts`-resolvern** — den befintliga `getAllDossiers()`-baserade clampen lämnas orörd som back-compat. Fixet sker en nivå upstream, så resolvern respekterar nu propagerad warn-only-enforcement utan att dess logik behöver byggas om.
- **Ingen ändring av `requestedCapabilities`-flödet** — snapshot-resolution funkade redan korrekt (returnerar tom array vid 0 capabilities). Bara overlayens default-fall hade fel beteende.

## Risker / kvarvarande

- **False-negative-risk:** En legitim integration vars capability orchestratorn missade att markera nedgraderas nu till warn-only istället för att blockera F3. Användaren ser keys som warning men kan manuellt sätta värdena utan att F3 vägrar starta. Trade-off accepterad i spec — konservativ default minskar avsevärt fler false-positives.
- **`tier3-build-spec.ts` har dubbla clamp-mekanismer nu** (upstream-warn-only via overlay + befintlig `isIntegrationDossierBacked`-clamp). Båda är harmlösa men en framtida konsolidering skulle kunna göra `tier3-build-spec.ts`-clampen redundant.
- Bug #14:s prompt-regel verifieras genom snippet-test, inte genom integration-test mot riktig LLM. Återkommer regeln i framtida output-bug → backstop kan vara en preflight-warning enligt planens optional-steg.
