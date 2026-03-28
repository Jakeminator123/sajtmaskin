# Handoff: Export reliability, deterministiska fixar, och nasta steg

**Datum:** 2026-03-27  
**Foregaende session:** World-class plan (fas 1-4), repo-cleanup, generation-testning  
**Denna session:** Fix Generated Project Reliability + manuell verifiering av genererad sajt

---

## Vad som gjordes

### Kanonisk export-pipeline
- `src/lib/gen/build-exportable-project.ts` — en enda funktion som alla download/export/quality-gate-vagar nu anvander.
- Eliminerar drift: nedladdade projekt ar identiska med det som verifierades i sandbox.
- Konsumenter: quality-gate route, version download, blob export, engine-version-zip.

### Uppdaterad exportbaseline
- `src/lib/gen/project-scaffold.ts` PACKAGE_JSON: Next 16.2.1, React 19.2.4, borttagen `"lint": "next lint"`.

### Nya deterministiska fixar
- `src/lib/gen/autofix/react-hook-import-fixer.ts` — saknade namngivna React hook-imports (useState, useEffect, etc.).
- `src/lib/gen/autofix/rules/tailwind-font-arbitrary-fixer.ts` — `font-[family-name:var(--x)]` som kraschar Turbopack.
- Bada inkopplade i autofix-pipeline OCH i `repairGeneratedFiles` (export-tid).

### System-prompt-regler
- Hero/above-the-fold: inga scroll-reveal-animationer.
- Reveal: aldrig `blur` pa text, bara opacity + translate.
- `font-[family-name:var(--x)]` forbjudet.

### Autofix-prompt
- Regel 5 i `buildAutoFixPrompt`: LLM far aldrig fraga anvandaren — fixa tyst och omedelbart.

---

## Nuvarande tillstand (poang fran extern granskning)

Extern rapport (`isolated_tests/FROM_DEEP_REASEARCH_GPT.txt`) bedomde repot pa **7/10** efter dessa fixar.
Kvarstaende gap till 9/10:

| Gap | Beskrivning | Prioritet |
|-----|-------------|-----------|
| Sluten reparationsloop | Quality-gate-felet borde parsas och skickas till autofix-LLM som exakt kontext. Nuvarande flode fungerar men ar klientdrivet (useAutoFix hook) | 1 |
| Sandbox-policy-centralisering | quality-gate och preview-runtime har duplicerade `isSafeRelativePath`, hardkodade template-URL:er. Centralisera i `runtime-url.ts` | 2 |
| Bildregler vs next.config | System-prompten forbjuder `picsum.photos` men scaffoldens `next.config.ts` tillater det i `remotePatterns` | 3 |
| Visuell QA med screenshots | `analyzeVisualQuality()` gor bara statisk kodanalys. Riktig visuell QA kraver screenshots via Playwright fran sandbox | 4 |
| Autofix-persistering | Autofix-resultat loggas till `logs/sajtmaskin-local.log` (dev) och SSE-stream, men sparas inte permanent i DB per version | 5 |

---

## Befintligt reparationsflode (finns redan, behover finjustering)

`src/lib/hooks/chat/useAutoFix.ts`:
- Lyssnar pa `AUTO_FIX_EVENT` nar quality-gate misslyckas.
- Hamtar felloggar fran DB (`loadVersionErrorSummary`).
- Bygger riktad reparationsprompt (`buildAutoFixPrompt`) och skickar till LLM.
- Capped: max 1 forsok per felorskak, max 2 autofix per chatt, 5 min TTL.
- **Svaghet:** klientdriven (avbryts vid sidnavigering), LLM fick fraga istallet for att fixa (nu fixat med regel 5).

---

## Rekommenderade nasta steg for ny agent

### Steg 1: Forbattra felkontext till autofix-LLM (hogst varde)
Nar sandbox-build misslyckas, extrahera de exakta TypeScript/build-felmeddelandena och skicka dem som strukturerad kontext i autofix-prompten. Idag sammanfattas loggar (`summarizeVersionLogsForAutoFix`) men specifika `tsc`-fel som "Cannot find name `siteConfig`" kan forsvinna i sammanfattningen.

Nyckelmoduler: `src/lib/hooks/chat/useAutoFix.ts`, `src/lib/hooks/chat/helpers.ts`, `src/app/api/v0/chats/[chatId]/quality-gate/route.ts`.

### Steg 2: Centralisera sandbox-policy
Eliminera duplicering mellan quality-gate route och preview-runtime. En kalla for: template-URL, `isSafeRelativePath`, build-policy.

Nyckelmoduler: `src/lib/mcp/runtime-url.ts`, `src/app/api/v0/chats/[chatId]/quality-gate/route.ts`.

### Steg 3: Synka bildregler med runtime-config
Ta bort `picsum.photos` fran `remotePatterns` i `project-scaffold.ts`, eller andra system-prompten sa de inte motsager varandra.

### Steg 4: Visuell QA med screenshots (langre sikt)
Lagg till screenshot-steg i `analyzeVisualQuality()` bakom feature-flag. Kraver Playwright-integration mot sandbox.

---

## Verifiering (alla grona)

- `npx tsc --noEmit` — rent
- 23 autofix/scaffold/export-tester passerar
- Alla 10 scaffolds granskade — inga forekomster av kanda problemmmonster
- Manuell test: genererad sajt bygger lokalt efter fixar
