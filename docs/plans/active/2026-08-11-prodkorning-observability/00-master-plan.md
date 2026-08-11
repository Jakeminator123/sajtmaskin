# Prodkörning 2026-08-11 — vad som går snett och varför vi inte såg det

**Status:** öppet spår · underlag för fortsatt felsökning
**Ursprung:** `/logg-internet`-session (Gen1–Gen3 i prod) + full `/logg` i efterhand
**Lokal evidens (gitignored):** `.cursor/logg-internet/runs/` — dumpar per chatId, notiser, findings

## Målbild

Tre saker hindrar att en användare får en fungerande sajt. Den här mappen samlar
vad vi vet om dem, med bevis, så nästa felsökning börjar från fakta i stället för
från noll.

| Nivå 2 | Fråga den svarar på |
|---|---|
| [`01-product-postcheck.md`](01-product-postcheck.md) | Vad kontrollerar Postcheck, och skulle den ge bättre sajter? |
| [`02-tmp-krasch.md`](02-tmp-krasch.md) | Varför dör Chromium i prod — minne, samtidighet eller något annat? |
| [`03-observability-och-logg.md`](03-observability-och-logg.md) | Varför missade `/logg` fyra riktiga defekter, och vad är fixat? |

## Sessionens tre körningar

| Gen | Sajt | Utfall | Kärnan |
|---|---|---|---|
| 1 | Frisörsalong (fritext) | lyckad | v1 verifier-blockad på saknad `Icon`-import, v2+v3 gröna |
| 2 | Byråflöde (Premium + F3) | delvis | F2 publicerad (v3); F3 v4 **och** v5 failade på `package.json` |
| 3 | MindSpace (template) | delvis | v3 fick radix-importfel + CSS-fel |

## Prioriterad kö

Ordnad efter hur mycket den påverkar en färdig sajt.

| # | Defekt | Bevis | Var |
|---|---|---|---|
| 1 | ~~F3-bygget tappar `package.json`~~ **LÖST 2026-08-11 (fix i arbetsträdet):** manifestet var aldrig trasigt — den SPARADE `package.json` i v4/v5 har alla deps + `scripts.build` (verifierat mot prod `files_json`). Verifiern dömde pre-merge-innehåll (SM-023) och stale-checkens package-klass avvisade fyndet p.g.a. justifikationsklausulen "…although app/layout.tsx imports…" (`FILE_PATH_RE`-vakten). Fix: `MANIFEST_JUSTIFICATION_CLAUSE_RE` i `stale-verifier-findings.ts` + 3 nya tester | `quality-gate:verifier-blocking` på v4/v5 vs komplett `files_json`; RAG-raderna var falska "still-failing" | `src/lib/gen/verify/stale-verifier-findings.ts` |
| 2 | **AI-sidan anropar aldrig sitt eget `/api/chat`** | routen streamar riktigt OpenAI-svar vid direktanrop; sidans HTML har 0 träffar på `api/chat` och texten "Detta är ett lokalt demosvar" | dossier + F2-mute-kontraktet |
| 3 | **`/tmp` tar slut → Chromium dör** | `free space in temporary directory: 0`, `AllocateRingBuffer() failed`; 6 postcheck-skips + 2 thumbnail-502 | [`02`](02-tmp-krasch.md) |
| 4 | Dossiern `openai-chat` är internt inkonsekvent | `chat-panel.tsx` = AI SDK v4-API, `route.ts` = v5 | `data/dossiers/hard/openai-chat/` |
| 5 | Google Maps blockeras av egen CSP | `script-src-elem blocked=maps.googleapis.com`; `buildCspPolicy()` saknar värden | `src/proxy.ts` |
| 6 | Wizard-rutter timeoutar | `/api/wizard/competitors` 504 vid 25s (egen `maxDuration`), `/api/wizard/enrich` 504 vid 30s | Analyserad-flödet |
| 7 | Scaffold-skyddad fil försvann i repair | `stillMissing: ['app/api/placeholder/route.ts']`, `reinjected: []` | `protected-paths.ts` |
| 8 | ~~Event-bus över-bundlar funktionerna~~ **LÖST 2026-08-11:** `turbopackIgnore` på join-ställena + `data/runs/**` i `outputFileTracingExcludes`. Samma klass hittades och fixades i `warm-typecheck.ts` (matchade **141 577** filer via `existsSync(cacheDir)`; `opaqueCachePath`-helper). Lokal prod-build: **0 Turbopack-varningar** | Turbopack build-warnings 10 194 + 141 577 filer | `event-bus.ts`, `warm-typecheck.ts`, `next.config.ts` |

Punkt 1 och 2 avgör om användaren får något som fungerar. Resten är härdning.

## Miljöflaggor — genomgång 2026-08-11

Genomgången gjordes på ägarens fråga "är någon env störande?". Verifierat mot
`src/lib/env.ts`, `src/lib/config.ts` och `docs/ENV.md`.

### Avviker från dokumenterad default

| Flagga | Värde | Dokumenterad default | Kommentar |
|---|---|---|---|
| `SAJTMASKIN_REFUSE_DOSSIER_STUBS` | `true` (alla miljöer) | **av** — opt-in | ENV.md rekommenderar uttryckligen att rulla ut i **preview först** och mäta hur ofta legitima bygg blockas. Här är den på i production direkt. En oresolvad dossier-import blockar previewn (`code_structure_failure`). Främsta kandidaten om previews blockas utan tydlig orsak. |
| `SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR` | `true` (prod + pre-prod) | **av i production** (på i preview/dev) | Slår på server-side repair-loop vid VM-byggfel i prod. Inte fel i sig, men det är en medveten avvikelse — och varje loop startar mer arbete på samma instans (jfr [`02`](02-tmp-krasch.md)). |
| `SAJTMASKIN_PREVIEW_PATCH_LANE` | `true` (alla miljöer) | **av** | Hot-patchar filer in i en körande preview-VM utan omstart av Next dev. Rimlig misstänkt för de hydration-mismatchar som syns i **varje** version, men obevisad. |
| `SAJTMASKIN_PREVIEW_PREWARM` | `true` (production) | av — opt-in | Kräver både host-URL och API-nyckel. Nyckeln är märkt **"Needs Attention"** i Vercel; preview-sessioner kör, så nyckeln fungerar — men statusen bör redas ut. |

### Ofarliga / som förväntat

| Flagga | Värde | Bedömning |
|---|---|---|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | `128000` | **No-op** — identisk med både `default` och `max` i `config/ai_models/manifest.json`. Kan tas bort utan effekt. Kan inte orsaka den trunkerade `package.json`. |
| `SAJTMASKIN_CONTENT_REVISION_GATE` | `true` | Ägarbeslut 2026-08-04 (R14), dokumenterat. Ger ärlig "Degraderad" i stället för falsk grön. Behåll. |
| `SAJTMASKIN_DISABLE_QUALITY_GATE` | `false` | Gaten är på. Rätt. |
| `SAJTMASKIN_VERIFIER_PASS` | `1` | På (default ändå). |
| `SAJTMASKIN_DOSSIER_PIPELINE` | `true` | Kärnflöde, dokumenterad prod-status sedan 2026-04-23. |
| `SAJTMASKIN_MODEL_ANTHROPIC` | `claude-opus-4.8` | Punkt→bindestreck sker i koden före API-anrop. OK. |
| `NEXT_PUBLIC_*` (quick-edit, add-panel, describe, inspect-bridge) | på | UI-opt-ins. Inlineas vid build. |
| `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES` | `fly.dev` | Brett men matchar preview-hosten. |
| `SAJTMASKIN_F2_PRODUCT_POSTCHECK` | **ej satt** | ⇒ default på. Rätt läge — se [`01`](01-product-postcheck.md). |

**Slutsats:** ingen env förklarar punkt 1 eller 2 i kön. Den enda som är värd att
ompröva som eget beslut är `SAJTMASKIN_REFUSE_DOSSIER_STUBS` i production.

## Genomfört 2026-08-11 (i arbetsträdet, ej committat)

| Ändring | Fil(er) | Verifiering |
|---|---|---|
| Kö #1: stale-checkens package-klass accepterar justifikationsklausuler | `stale-verifier-findings.ts` (+ 3 tester) | vitest 47/47 grönt |
| Kö #3 steg 1: `/tmp`-mätning före varje Chromium-start | `capture/browser.ts` (`[capture-browser] tmp free: …`) | typecheck + browser.test grönt |
| Kö #8: Turbopack över-bundling (event-bus + warm-typecheck) | `event-bus.ts`, `warm-typecheck.ts`, `next.config.ts` | lokal prod-build: 0 varningar |
| Postcheck-krascher syns: skip-orsak `playwright_unavailable`/`navigation_failed`/`timeout`/`runtime_error` loggas som `warning` | `post-checks.ts` | post-checks.test grönt; gates opåverkade (ankrar på `preflight:quality-gate`) |
| `/logg` steg 3c: appens console-rader obligatoriska | `.cursor/skills/logg/SKILL.md`, `.cursor/commands/logg.md` | — |

Verifierade svar på ägarfrågor (2026-08-11):

- **Rätt databas?** Ja. Prod-dumparna går mot `aws-1-us-east-1` = Supabase-projektet **jakebase** (prod). Dev = `jakembase_dev` (eu-north-1). `--env=.env.vercel.production.pulled` styr valet.
- **RAG "5000 rader"?** `LIMIT 5000` är taket för EN indexbyggnad: senaste raderna ur `error_log_events` läses **en gång per instans per 60s** (throttlad, fire-and-forget) och blir ett TF-IDF-index i minnet. Det är inte 5000 rader per generering.
- **Reparationsmodell?** Finns: `fixer`-fasen per tier (`manifest.json` → `phaseRouting`): premium = `gpt-5.6-sol`, pro = tier-primär, max = pinnad `gpt-5.3-codex`. Gen2:s "still-failing" berodde inte på modellen utan på kö #1-buggen — fynden var redan lösta i mergade filer.

## Nästa steg

1. Utred punkt 2 (AI-sidans attrapp) — den gör en publicerad sajt oärlig.
2. Läs av `[capture-browser] tmp free:`-raderna i Vercel efter nästa deploy → välj åtgärd i [`02`](02-tmp-krasch.md) (prune NDJSON / städa profiler).
3. Verifiera kö #1-fixen live: kör "Bygg integrationer" igen efter deploy — v6 ska bli grön om manifestet är komplett.
4. Beslut: ska `SAJTMASKIN_REFUSE_DOSSIER_STUBS` vara på i production?

## När planen är klar

Väv in en rad i [`../../avklarat/README.md`](../../avklarat/README.md), radera mappen
och uppdatera routern i [`../README.md`](../README.md) i samma ändring.
