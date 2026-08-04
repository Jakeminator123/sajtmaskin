---
status: review-handoff
created: 2026-08-04
branch: chore/sanering-integration
base: origin/master @ 8a192b063 (branchpunkt)
topic: Granskningsunderlag för sanering-initiativet — vad som beställdes, vad som gjordes, hur det verifierats, och en checklista för en extern buggrunda.
---

# Granskningsunderlag — sanering & uppdelning (session 2026-08-04)

Detta dokument är till för en **extern granskare** som ska göra en buggrunda på
hela `chore/sanering-integration`. Det beskriver avsikten, arbetssättet, exakt
vad som ändrades, hur det verifierats, kända risker/avvikelser, och en
prioriterad granskningschecklista.

## 1. Vad som beställdes (avsikt)

Utgå från master och exekvera det **kvarvarande** arbetet i planen
[`00-master-plan.md`](00-master-plan.md) (steg 0–10: false-green, död kod,
dokumentstädning, megafilsuppdelning, repo-storlek, dependency-split,
benchmark). Arbetssättet som beställdes:

- En **lokal integrationsbranch** (`chore/sanering-integration`) avstampad från
  master; **inga PR:er mot master** förrän ägaren säger till.
- Arbetet delas på **billiga parallella agenter i isolerade git-worktrees**, en
  lane per område. Orkestratorn granskar varje agents **diff + verifiering** och
  mergar in lokalt en i taget, löser konflikter.
- **Modellpolicy:** billig default = **grok 4.5 high**; **starkare modell
  (Claude Opus 5)** på regressionskänsliga false-green-/pipeline-ytor.
  Kodifierad i [`.cursor/rules/svarm-modellval.mdc`](../../../../.cursor/rules/svarm-modellval.mdc).
- **Beteendebevarande:** megafiler delas bakom **oförändrad fasad** (samma
  publika exports/route-kontrakt), befintliga tester orörda och gröna.

## 2. Nyckelfakta för granskaren

| Fakta | Värde |
|---|---|
| Branch | `chore/sanering-integration` |
| Branchpunkt (bas) | `origin/master` @ `8a192b063` |
| Total diff mot bas | **257 filer, +37 711 / −35 814** |
| Commits före bas | 46 (varav ~19 `merge(sanering)`-lanes) |
| **Läge mot AKTUELL `origin/master`** | **46 före / 10 efter** → behöver rebase/merge med master innan PR (10 nya master-commits kan krocka) |
| Verifiering | `npm run typecheck` = 0 fel · `npm run lint` = 0 errors · riktade vitest = baseline · backoffice 325 passed + 45 subtests · preview-host `check`+`test:guards` gröna |

Se hela diffen per lane (rekommenderat granskningssätt — en `merge(sanering)`
= en reviewbar enhet):

```
git -C <repo> log --oneline 8a192b063..chore/sanering-integration
git -C <repo> show <merge-sha>            # per lane
git -C <repo> diff 8a192b063..chore/sanering-integration --stat
```

## 3. Vad som gjordes (per lane)

Alla megafil-uppdelningar följer samma mönster: originalfilen blir en **tunn
fasad** som re-exporterar från nya ansvarsmoduler; externa importörer och
befintliga tester är orörda.

### Wave 1 (grok 4.5 high)

| Lane | Ändring | Verifiering |
|---|---|---|
| L2 död kod | Tog bort döda Redis-bucket-listor (efter #714) i `scripts/db/redis-health-check.mjs` + `backoffice/pages/redis_health.py`; tog bort död direkt-dep `ms` (`package.json` + lockfil synkad) | typecheck 0 · knip utan `ms` · pytest 8/8 |
| L1 docs Våg 3 | Löste upp `docs/plans/archived/` (18 filer, roll som lifecycle-slot behållen), konsoliderade 4 äldsta bug-swarm-arkiven → SHA-index, `Kvarvarande-uppgifter.md` → ny restlista, ~15 relinks | `check-active-doc-links` + `npm run hygiene` gröna |
| L3 `backoffice/shared.py` | 1832 → **205** raders fasad + 16 moduler i `shared_lib/`; 102 publika namn bevarade | backoffice 325 + 45 subtests |

### Wave 2a (grok)

| Lane | Fil(er) före→efter | Verifiering |
|---|---|---|
| CF | `preview-host/src/server.js` 1261→**40** + 6 moduler i `server/`; `check`-scriptet uppdaterat | `npm run check` + `test:guards` gröna |
| CH | `src/lib/backoffice/template-generator.ts` 1424→**12** + 5 moduler | typecheck 0 |
| CG | `scaffold_lifecycle.py` 2741→**931**, `dossiers.py` 2025→**169**, `scaffold_wizard.py` 1271→**942** (+ `_lib/`); `pages/__init__.py` orörd | backoffice 325 + 45 |
| CD | `hooks/chat/stream-handlers.ts` 1437→**188** (+8), `helpers.ts` 1324→**39** (+10) | typecheck 0 · 173/173 |

### Wave 2b (grok)

| Lane | Fil(er) före→efter | Verifiering |
|---|---|---|
| P preview-panel | `PreviewPanel.tsx` 1792→807, `PreviewPanelCodeSectionEditors.tsx` 1502→47, `PreviewPanelDossiers.tsx` 1244→44 | typecheck 0 · preview-panel 105/105 |
| B builder | `BuilderMessageTooling.tsx` 1542→11, `BuilderShellContent.tsx` 1356→8, `VersionHistory.tsx` 1271→6 | typecheck 0 · builder 86/86 |

### Wave 2c (Opus 5 på false-green-ytan, grok på API-hotspots)

| Lane | Fil(er) före→efter | Verifiering |
|---|---|---|
| verify/stream (Opus) | `finalize-preflight.ts` 1653→6, `server-verify.ts` 1511→22, `repair-loop.ts` 1139→16 | typecheck 0 · `gen/verify`+`gen/stream` **506/506** · **rad-för-rad multiset-diff = 0 ändrade logikrader** |
| autofix/chat (Opus) | `autofix/pipeline.ts` 1497→fasad, `import-validator.ts` 1329→fasad, `create-chat-stream-post.ts` delad | typecheck 0 · `gen/autofix` 580/580 · batch 960/960 |
| audit (grok) | `api/audit/route.ts` 1724→9, `audit-modal.tsx` 1207→3 | typecheck 0 · audit 20/20 |
| deployments (grok) | `api/v0/deployments/route.ts` 1476→5 | typecheck 0 · deployments 84/84 |

### Wave 3 (starkare modell)

| Lane | Ändring | Verifiering |
|---|---|---|
| LD dep-katalog | Ny `config/generated-site-dependencies.json` som enda källa för generator-versioner; `dep-completer`/`dependency-utils`/`project-scaffold` läser den i st.f. hårdkodat i tre filer | typecheck 0 |
| LE embeddings→Blob | `template-embeddings` laddas lazy från Blob/fs (ur serverbundlen) med bevarad fallback; **två nya testfiler** (fallback); ny Blob-env registrerad i `env-policy.json` + `docs/ENV.md` + `env.ts` + `next.config.ts` | typecheck 0 · `src/lib/templates` 38/38 |

## 4. Orkestratorns egna review-ingrepp (redan gjorda)

- **L1:** agenten hittade på en Linear-referens (`SAJ-23`) i restlistan — **borttagen** (commit `aca18b734`), mot repo-regeln "ingen extern tracker".
- **CD stream-handlers:** agenten omstrukturerade closures → muterbart tillstånd (inte ren flytt). Granskades rad-för-rad; semantiken (text-batch-flush före icke-text-event, garanterad slutflush, terminalvillkor, 14 event-typer) bevarad, 173/173 gröna → **accepterad medvetet**. Detta är den enda lane som INTE är ren mekanisk flytt.

## 5. Kända avvikelser & risker (läs innan granskning)

| # | Punkt | Bedömning |
|---|---|---|
| 1 | `src/app/api/engine/chats/stream/route.test.ts` failade **en gång** i tung parallell batch (6→16 s), men grönt isolerat + på baseline + vid omkörning | **Flakighet/timing, inte regression.** Kan loggas P3 i `BUG-SWARM-BACKLOG.md`. |
| 2 | Branchen är **10 commits efter** aktuell `origin/master` | Måste rebasas/mergas med master innan PR; kolla konflikter i filer master rört sedan `8a192b063`. |
| 3 | Arbetssättet avviker från repo-standard "en PR per fil mot master" | Medvetet val (lokal integration). Ska brytas till granskbara PR:er mot master via grinden (bugbot + review-window). |
| 4 | LE införde **en ny env-var** (Blob base-URL) | Registrerad i ENV-kontraktet; granska att namn/policy är rätt och att fallback verkligen degraderar tydligt när Blob saknas. |
| 5 | CD stream-handlers är en **omstrukturering**, inte ren flytt (se §4) | Högsta enskilda risken bland splitsarna trots gröna tester. |

## 6. Ej gjort / utanför denna session

- **LF produktbenchmark (steg 10):** ej påbörjad — separat spår, kan leva vidare.
- **Ägargrindat (kräver ägarbeslut, ej agent):** `git filter-repo`-historik­omskrivning (steg 8, destruktiv), radering av `_parkering/`, uppladdning av `intro.mp4` → Blob (steg 7a).
- **Exportyta (267/649):** löpande mål — vissa `export` ströks vid extraktion, men ingen dedikerad batch.

## 7. Granskningschecklista (prioriterad — buggrunda)

**P0/P1 — fokusera här:**

1. **False-green-ytan** (`gen/verify`, `gen/stream`, `gen/autofix`,
   `create-chat-stream-post`): bekräfta att fasaderna re-exporterar exakt samma
   publika yta och att ingen gren/tidig-return/sidoeffekt tappats. Bevis finns
   (multiset-diff, 506/506 + 580/580), men detta är repo:ts regressionskänsliga
   kärna — läs merge-commitsen `2598130b2` och `9b09b9de1` noga.
2. **Route-kontrakt** (`api/audit/route`, `api/v0/deployments/route`): samma
   exporterade handlers (GET/POST/`runtime`/`maxDuration`), samma signaturer.
3. **CD stream-handlers** (§4): den enda omstruktureringen — verifiera SSE-
   ordningssemantiken.
4. **LE fallback:** Blob otillgänglig ⇒ tydligt fel, inte tyst tom sökning.
5. **Env/lockfil:** `ms`-borttaget (endast direkt-dep, transitivt kvar), LE:s
   nya env registrerad korrekt, inga läckta secrets.

**P2/P3 — logga, blockera inte:**

6. Fasadfiler med kvarvarande oanvända importer (kosmetiskt).
7. Fortfarande stora enskilda ansvarsmoduler (t.ex. `single-pass.ts` ~1124,
   `post.ts` ~841) — under ~1200-målet men kan delas vidare.
8. Flakigt test (§5.1).

**Så kör du verifieringen lokalt:**

```
npm run typecheck            # 0 fel förväntat
npm run lint                 # 0 errors (8 pre-existing warnings i conversation.tsx)
npx vitest run src/lib/gen/verify src/lib/gen/stream   # 506/506
npx vitest run src/lib/gen/autofix                     # 580/580
python -m pytest backoffice/ -q                        # 325 passed + 45 subtests
```

## 8. Klart-läge

Steg 0–9 i master-planen är levererade i denna branch (steg 10 benchmark +
ägargrindade poster kvarstår). Nästa steg enligt ägarens val: betala den
blockerande fakturan (bugbot/subagenter behöver requests), rebasa mot aktuell
master, och bryta branchen till granskbara PR:er mot master via merge-grinden.
