# Varför planen ser ut som den gör — mätningen 2026-08-05

Detta är underlaget till [`00-master-plan.md`](00-master-plan.md). Det svarar på
ägarfrågan "kan man parallellisera saker för att snabba upp allt?" och förklarar
varför svaret inte blev den uppdelning som låg närmast till hands.

## Frågan som ställdes

Hypotesen var att en generation gör tre saker som skulle kunna delas upp på tre
agenter och sys ihop på slutet: hämta bilder (i kanske 80 % av fallen), skriva
kod, och hämta dossiers/capabilities. Om de körs sekventiellt i något mellansteg
borde en fan-out (bred utgrening) vara en vinst.

Mätningen visar att premissen inte håller: **två av de tre banorna kostar redan
noll**, och den tredje är inte en bana utan hela körningen.

## Så togs siffrorna fram

Read-only mot prod, ingen skrivning.

1. `npm run db:latest:prod` → senaste sajten.
2. `dump-logs.mjs` med alla kinds för de två senaste chattarna.
3. Ett engångsskript direkt mot `generation_telemetry.meta`, eftersom
   `dump-logs.mjs` **inte** selektar `meta` för telemetri-kinden. Utan det steget
   är fas-tiderna osynliga för `/logg`. Det är precis den luckan steg 1 i planen
   stänger.
4. Ett engångsskript som räknar bild-URL:er i `engine_versions.files_json`.

Strömtiden är inte ett eget fält utan räknas fram som `duration_ms` minus summan
av `meta.postStreamSteps`. Den posten rymmer därför även Deep Brief och
orkestrering, men båda är små: orkestreringen är CPU plus mtime-cachad
fil-läsning, och dess enda nätverksanrop är scaffold-/variant-embeddings.
Codegen-strömmen dominerar posten.

## Vad mätningen visar

Fyra versioner, två chattar, båda F2/`design`, alla med `finalizePath: full`.

| Körning | Scaffold / modell | Totalt | Före finalize (brief + orkestrering + **ström**) | Efter ström | Varav verifier |
|---|---|---|---|---|---|
| `9cdb3e31` v1, init | `blog` / `gpt-5.6-sol` | 414,6 s | **326,1 s (78,7 %)** | 88,5 s | 69,2 s |
| `41be90f2` v1, init | `landing-page` / `gpt-5.3-codex` | 159,3 s | **157,3 s (98,7 %)** | 2,0 s | skippad |
| `41be90f2` v2, follow-up | samma | 47,3 s | 45,8 s (96,8 %) | 1,5 s | skippad |
| `41be90f2` v3, follow-up | samma | 70,7 s | 69,3 s (98,0 %) | 1,4 s | skippad |

Genomströmning i completion-tokens: 182, 134, 148 respektive 138 tokens per
sekund. Sammanhållet nog över två modeller för att behandla strömtiden som
i praktiken linjär i antalet output-tokens.

Fasfördelningen efter strömmen, för den enda körning där något faktiskt hände:

| Fas | `9cdb3e31` v1 | De tre landing-versionerna |
|---|---|---|
| `url_expand` | 0 ms | 0–1 ms |
| `autofix` | 570 ms | 191–971 ms |
| `validate_syntax` | 17 076 ms (LLM-fixer kördes) | 3–14 ms |
| `materialize_images` | **0 ms** | **0–1 ms** |
| `verifier` | **69 226 ms** | skippad (`no_verifier_signal`) |
| `parse_merge_preflight` | 1 586 ms | 1 008–1 199 ms |

## Tre fynd

### 1. Bilderna hämtas aldrig under genereringen

`materialize_images` rapporterade `replacedCount: 0` i samtliga fyra versioner.
Ändå har sajterna 8–13 bilder var. Förklaringen syns i `files_json`: modellen
skriver Unsplash-URL:er rakt ur minnet, i formen
`https://images.unsplash.com/photo-1519046904884-…?auto=format&fit=crop&w=1500&q=85`.

Materialiseringssteget letar efter `/placeholder.svg?…&text=`-platshållare, och
sådana finns inte i utdatan. Det gör steget till en no-op i normalfallet.

Två konsekvenser. Latensmässigt finns ingenting att parallellisera eller
prefetcha — det som hade varit den självklara vinsten i fan-out-idén är redan
gratis. Korrekthetsmässigt är det däremot värt att veta att bild-ID:na kommer
ur modellens minne och alltså kan peka på bilder som inte finns; det är vad den
asynkrona HEAD-valideringen och `knownBrokenImageReplacements` fångar, båda
utanför kritiska vägen.

### 2. Verifiern betalade 69 sekunder för noll blockerare

Den enda körning där verifiern kördes tog 69,2 s och returnerade
`blockingCount: 0` med fem kvalitetsfynd. Den triggades av `risky_fixes`: autofix
hade gjort 34 fixar klassade som risky.

Tittar man på `meta.autofix.fixers` har varenda en av dem
`category: "mechanical"`. Det handlar om `jsx-checker` som lägger till
default-exporter och `import-validator` som lägger till saknade importer — 30 av
de 34 fixarna. Klassningen är samtidigt fullt medveten: `fixer-registry.test.ts`
slår uttryckligen fast att struktur- och cross-file-muterare ska vara risky, och
`summarizeAutofixRisk` failar closed på fixers den inte känner igen.

Det är alltså inte en bugg utan en policykostnad, och det finns bara ett
datapunkt. Därför är steg 2 i planen gated på ett mätfönster i stället för
formulerat som en fix.

### 3. Allt annat är avrundningsfel

De tre landing-versionerna spenderade 1,4–2,0 s på hela efterströmskedjan. Även
i den tunga blogg-körningen är allt utom verifiern och LLM-fixern tillsammans
under 2,2 s. Orkestreringen — scaffold-matchning, route-plan, contracts,
BuildSpec, capability-inferens, dossier-selektion — syns inte alls, vilket
stämmer med koden: `selectDossiersForRequest` är ett uppslag i en mtime-cachad
registry, och `inferCapabilities` är regex.

## Varför "tre agenter" inte är svaret, och vad som är det

Uppdelningen bild / kod / dossier fördelar arbete som är 0 % / ~99 % / ~0 %. Två
av tre workers skulle vara klara innan de börjat.

Den enda splitten som biter på 79–99 % är att dela **koden** — per fil eller per
route, efter en billig kontraktspass som låser designtokens, delade komponenter
och `package.json`. Det är en riktig vinst på pappret, och det är också det
enda i den här planen som kostar mer än timmar. Det ligger i
[`02-parallell-codegen.md`](02-parallell-codegen.md) som en beslutspunkt, inte
som beställt arbete.

Innan dess finns två spakar som inte rör arkitekturen alls: verifier-triggern
(steg 2) och antalet output-tokens (steg 3). Blogg-körningen gick med
`contextPolicy: heavy` och `qualityTarget: premium` på 121k prompt-tokens och
59k completion-tokens; landing-körningen klarade sig på 20k/21k och tog en
tredjedel så lång tid.

## Uppskattad vinst

| Åtgärd | Blogg init (414 s) | Landing init (159 s) | Follow-up (47–71 s) |
|---|---|---|---|
| Steg 1 mätning | ±0 | ±0 | ±0 |
| Steg 2 verifier-trigger | −69 s | 0 | 0 |
| Steg 3 output −20 % | −65 s | −31 s | −10 s |
| **Steg 1–3 tillsammans** | **~280 s (−32 %)** | **~128 s (−20 %)** | ~40–60 s (−15 %) |
| Steg 4 ovanpå | ~170–190 s (−55 %) | ~80–100 s (−40 %) | sannolikt sämre |

Siffrorna för steg 2 gäller bara när verifiern faktiskt triggar — här en av fyra
körningar. Siffrorna för steg 3 antar att en femtedel av outputen går att ta bort
utan kvalitetstapp, vilket är en hypotes och inte en mätning.

## Vad som INTE är verifierat

- Urvalet är fyra versioner från två chattar, båda F2. Inga F3-körningar, inga
  imports, inga plan-mode-turer.
- Verifier-fyndet vilar på **en** körning.
- Att 20 % av outputen kan tas bort utan kvalitetstapp är obevisat.
- Vinstsiffrorna för steg 4 är räknade, inte uppmätta: strömtid delad på tre
  plus påslag för kontraktspass, skew mellan workers och merge.

## Sidofynd: en defekt som inte hör till den här planen

Chatt `41be90f2` har tre versioner som alla står kvar i `verifying` / `draft`.
v3 loggade `quality-gate:promote-guard-unavailable` — "Build checks passed but
the promotion guard could not verify the finalize signal; promotion deferred
(retryable)". Grinden gick alltså igenom men befordran skedde aldrig. Det är en
korrekthetsbugg och hör till `BUG-SWARM-BACKLOG.md`, inte hit.
