# 01 — Projektionen blir kanonisk brygga (ta över checkpointen)

**Mål:** `data/dossiers/_index/capability-map.json` blir den enda genererade, CI-grindade
projektionen av dossier-fakta som alla icke-TS-konsumenter (backoffice, genererad Markdown) läser.
**Byggmodell:** hög (`gpt-5.6-sol` eller `claude-sonnet-5-thinking-high`). **Beroenden:** inga.

## Utgångspunkt

Checkpoint `d7caf4cf` på branch `agent/dossier-truth-map-c731d541` (10 filer). Hämta med
fetch i egen worktree — **inte** pull i huvudcheckouten:

```powershell
git fetch origin
git worktree add ..\sajtmaskin-dossier-truth -b feat/dossier-truth-projektion origin/agent/dossier-truth-map-c731d541
npm run worktree:link -- ..\sajtmaskin-dossier-truth
```

Den fulla 65-filsversionen (`c768c783`) finns inte på GitHub. Återskapa bara det som
listas här — anta inte att checkpointen innehåller mer än den gör.

## Steg

1. **Rebasa mot aktuell master.** Genererade filer (`capability-map.json`,
   `docs/generated/*.generated.md`) löses genom regenerering efter rebase, aldrig handmerge.
2. **Verifiera generatorns miljöberoenden.** `regenerate-capability-map.ts` importerar nu
   `getAllDossiers()` och `getF2MutedIntegrationCapabilities()`. Bevisa att tsx-körningen
   fungerar utan env/DB (kör i ren shell utan `.env`). Om orchestrate-importen drar in tunga
   moduler: bryt ut mute-härledningen till en ren funktion.
3. **Determinism + idempotens.** Två körningar av `npm run dossiers:capability-map:write`
   i följd får inte ge diff (`git diff --exit-code`). Samma för `npm run docs:generate`.
4. **CI-grind.** Lägg stale-kontrollen i `quality`-workflowen: kör write-läget och faila på
   `git diff --exit-code` (eller återinför check-läget som blocking step). Detta ersätter den
   2026 borttagna `capability-map:check`-gaten — skillnaden nu är att backoffice är beroende
   av filen, så staleness har en verklig konsument.
5. **Återskapa testerna** (fanns bara i opublicerade `c768c783`):
   - `backoffice/test_dossier_truth_map.py`: `build_system_map_rows`, `filter_system_map_rows`,
     DOT-generering (determinism), `_capability_map_is_stale` (hash-drift, saknad fil, trasig JSON).
   - Vitest för generatorn: truth-view-fälten, sorteringsdeterminism, registry-vs-disk-räknevakt.
   - **Analytics-kontrollfallet låses i test:** `vercel-analytics` ska ha `f2Disposition: "deferred"`,
     `f2Reason: "policy-only"`, `buildServerRequirement: false`, `buildServerReasons: []`.
     Blir F2-kolumnen och build/server-kolumnen samma härledning har modellen blivit fel igen.
6. **Grinda den nya Python-källistan.** `CAPABILITY_MAP_FIXED_SOURCES` (constants.py) speglar
   TS-listan `FIXED_SOURCE_PATHS`. Välj en: (a) paritetstest som jämför listorna, eller
   (b) låt Python läsa vägarna ur projektionens `sourceFiles`-nycklar och hasha dem
   (upptäcker innehållsdrift; nya källfiler upptäcks vid nästa TS-regenerering). Motivera valet i PR:en.
7. **Systemkarta-fliken följer med** som den är i checkpointen (den är läsyta för projektionen);
   UX-förbättringar hör till delplan 04.

## Raderingar i denna plan

Inga — denna plan lägger fundamentet. Raderingarna kommer i 02/03.

## Verifiering (minst)

```powershell
npm ci --no-audit --no-fund
npm run dossiers:capability-map:write; npm run dossiers:capability-map:write; git diff --exit-code
npm run docs:generate; npm run docs:generate; git diff --exit-code
npm run dossiers:validate-all; npm run docs:test; npm run docs:links
npm run typecheck; npm run lint; npm run hygiene
python -m pytest backoffice/test_dossier_truth_map.py backoffice/test_dossiers_page.py
```

Plus manuellt: starta backoffice, öppna Dossiers → Systemkarta, verifiera Analytics-raden.

## Definition of done

CI blockerar stale projektion; generatorn är deterministisk och idempotent; testerna ovan finns
och är gröna mot aktuell master; Systemkartan renderar ur projektionen; draft-PR öppnad med
sanningsägare, projektioner och körda tester beskrivna; bugbot-pass dokumenterat.
