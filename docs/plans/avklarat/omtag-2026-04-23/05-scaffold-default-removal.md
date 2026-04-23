---
id: omtag-05-scaffold-default-removal
title: Scaffold-default-persistering bort — rötningsfix för "Nordic Future Summit"-klassen
phase: 1
priority: P1
parallell_med: [03-wave-split-heatspots]
blockerad_av: [02-eval-baseline]
estimat: "3–5 h"
owner_files:
  - src/lib/gen/scaffolds/serialize.ts
  - src/lib/gen/stream/finalize-merge.ts
  - src/lib/gen/scaffolds/*-defaults/** (existing default-file-folders per scaffold)
  - src/lib/gen/scaffolds/types.ts (om ScaffoldSerialization-typen måste ändras)
  - tester för ovanstående
---

# 05 — Scaffold-default-persistering bort

## Mål

Ta bort mekaniken där scaffold-default-filer (`app/page.tsx`, `app/layout.tsx`, m.fl.) persisteras direkt till versionen om LLM inte skriver om dem. Istället: skicka default-innehållet som **hint i prompten**, kräv att LLM alltid emitterar `app/page.tsx` (minst som shell).

## Varför det här

Detta är rotorsaken till "Nordic Future Summit"-klassen av buggar (layout från LLM, page från scaffold-default → metadata från en värld, innehåll från en annan). Fatigue-agentens P1-C (placeholder-guard) och P1-D (layout↔page-invariant) är två guards ovanpå samma mekanik. Tar vi bort persisteringen försvinner hela klassen — utan att lägga till lager.

## Scope

| In | Ut |
|---|---|
| Ändra `serialize.ts` så defaults **inte** persisteras | Ändra LLM-prompten på djupet (det ägs av 03) |
| Ändra `finalize-merge.ts` så saknade scaffold-filer räknas som LLM-fel | Ändra scaffold-registret i sig |
| Lägga till en shell-fallback enbart om LLM tokens tog slut mid-stream | Ta bort scaffold-default-filer (de måste finnas kvar som referens) |
| Uppdatera tester för `serialize.ts` och `finalize-merge.ts` | Röra autofix-reglerna |

## Inputs

1. `src/lib/gen/scaffolds/serialize.ts` — hela
2. `src/lib/gen/stream/finalize-merge.ts` — hela
3. En default-mapp att se struktur: leta efter `src/lib/gen/scaffolds/landing-page-defaults/` eller liknande — förmodligen `src/lib/gen/scaffolds/<scaffold-id>/defaults/` eller per scaffold-modul
4. `src/lib/gen/finalize-preflight.ts` — om shell-fallback redan finns där (ref S4 från #83)
5. `docs/architecture/scaffolds.md` om det finns

## Exekveringssteg

1. **Kartlägg defaults-källorna**:
   - `rg "default.*content|DEFAULT_FILES|scaffoldDefaults" src/lib/gen/scaffolds -n`
   - Dokumentera i `OMTAG/05-defaults-map.md` vilka filer per scaffold som idag läggs in via default
2. **Ändra kontrakt**:
   - `serialize.ts`: returnera en separat struct `{ emittedFiles, defaultHintFiles }` — bara `emittedFiles` går till persist-pathen
   - `finalize-merge.ts`: om `app/page.tsx` saknas i LLM-output efter merge → markera som LLM-fel (inte tyst komplettera från scaffold-default)
3. **Shell-fallback-undantag**: om `reason === "token_limit_mid_stream"` *och* LLM hann skriva `app/layout.tsx` men inte `app/page.tsx` → generera minimal shell (en rubrik + "Sidan skrivs fortfarande"-text) med `data-sajtmaskin-shell="true"`-attribut. Detta markerar tydligt i DOM att det är fallback, och kan kollas av 06:s status-eventbus.
4. **Prompt-hint**: lägg till i `system-prompt.ts` (koordinera med 03 om båda rör filen — skilda sektioner så branchar kan merge:as manuellt). Ny sektion: "Scaffold defaults (som hint, inte fil):". Uppgift: lista filnamn + 3-radig sammanfattning per fil, **inte** hela koden.
5. **Uppdatera tester**: framförallt för merge-path — förvänta att saknad `page.tsx` ger ett fel, inte en default-komplettering.
6. **Nedgradera äldre "keep-default"-regler**: om det finns autofix-regler som *kompletterar* saknade filer från defaults → ta bort (koordinera med 07 om det berör type-only-import).

## Får INTE göras

- Ta inte bort själva default-filerna från disk — de används fortfarande som promt-hint och som testfixtures.
- Inga nya env-flaggor ("låt användaren välja gammalt beteende"). Cut over, inte feature-flag.
- Inga nya guards — bara rotorsaksfix.
- Rör inte `system-prompt.ts` utanför den specifika sektionen (03 äger övrig refaktor).

## Acceptance criteria

- [ ] `serialize.ts` returnerar emittedFiles separerat från defaultHintFiles.
- [ ] `finalize-merge.ts` kastar fel (eller markerar verifikationsblockerat) om LLM inte emitterat `app/page.tsx` utom när shell-fallback-undantaget träffar.
- [ ] Shell-fallback har `data-sajtmaskin-shell="true"`.
- [ ] Alla tester i `src/lib/gen/scaffolds/**` + `src/lib/gen/stream/**` gröna (uppdatera de som testar gamla default-beteendet).
- [ ] Eval-baseline (02) på branchen → inga regressions på de 10 canonical-prompterna (särskilt `landing-*`-grupperna).
- [ ] `OMTAG/05-defaults-map.md` committad — visar vilka filer som var defaults innan och vilka som nu är hints.
- [ ] `docs/architecture/glossary.md` uppdaterad: nytt begrepp "scaffold default hint" vs "LLM-emitted file".

## Branch

`omtag/05-scaffold-default-removal`
