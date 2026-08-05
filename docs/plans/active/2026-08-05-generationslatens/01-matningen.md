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
   `dump-logs.mjs` vid mätningstillfället **inte** selekterade `meta` för
   telemetri-kinden. Utan det steget var fas-tiderna osynliga för `/logg`.
   Det var precis den luckan steg 1 stängde — den är nu åtgärdad, så en
   framtida mätning behöver inget engångsskript.
4. Ett engångsskript som räknar bild-URL:er i `engine_versions.files_json`.

Strömtiden var vid mätningen inte ett eget fält utan räknades fram som
`duration_ms` minus summan av `meta.postStreamSteps`. Den posten rymmer därför
även Deep Brief och orkestrering, men båda är små: orkestreringen är CPU plus
mtime-cachad fil-läsning, och dess enda nätverksanrop är scaffold-/variant-
embeddings. Codegen-strömmen dominerar posten.

**Siffrorna i tabellen nedan är alltså det derivatet, inte ren strömtid.** Steg 1
införde `meta.streamMs`, som mäts direkt vid stream→finalize-gränsen och därför
**inte** innehåller brief eller orkestrering. Jämför inte de två talen rakt av —
nya körningar ska läsas på `streamMs`.

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

Fasfördelningen efter strömmen:

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

### 2. Verifiern var trippel-gatead — och etiketten i telemetrin ljuger

Den enda körning där verifiern kördes tog 69,2 s och returnerade
`blockingCount: 0` med fem kvalitetsfynd. Telemetrin anger
`trigger: "risky_fixes"`, vilket ser ut som att autofix orsakade passet. **Det
gör den inte.**

`fast-path.ts` skriver etiketten `risky_fixes` ovanpå `verifierPolicy.reason`
när passet ändå ska köras och det råkar finnas risky fixar. Själva beslutet
fattas i `resolveVerifierPassPolicy` (`policy.ts`), och där matchade körningen
tre oberoende villkor:

| Villkor | Rad | Körningens värde |
|---|---|---|
| `qualityTarget !== "standard"` → `high_quality_target` | `policy.ts:58` | `premium` |
| `contextPolicy === "heavy"` → `heavy_context` | `policy.ts:64` | `heavy` |
| `changeScope === "page-addition"` → `high_risk_change_scope` | `policy.ts:67` | `page-addition` |

Vart och ett hade räckt. Att bara ta bort ett flyttar beslutet till nästa.

Dessutom: `hasLlmFixesInValidate` var sant (`validate_syntax.fixerUsed: true`),
och det blockerar `safe_fixes_only`-hoppet i `fast-path.ts` **oavsett** hur
fixarna är klassade. Att omklassa `import-validator` och `jsx-checker` från
risky till safe hade alltså inte sparat en sekund på den här körningen. Den
klassningen är dessutom medveten: `fixer-registry.test.ts` slår fast att
struktur- och cross-file-muterare ska vara risky, och `summarizeAutofixRisk`
failar closed på okänd fixer.

Den riktiga frågan är därför inte vilken tröskel som är felinställd, utan om en
F2-preview ska köra ett 69-sekunders LLM-pass över huvud taget när RenderGate
ändå ägs av klienten. Det är ett ägarbeslut, och det är steg 3 i planen.

### 3. Klassningen är den gemensamma nämnaren

En bloggsajt fick `qualityTarget: premium` + `contextPolicy: heavy`. Landing-
sajten fick `standard` + `normal` och tog en tredjedel så lång tid.

Den klassningen betalar sig tre gånger om: `heavy` context ger 121k
prompt-tokens mot landing-sajtens 20k, `premium` target ger mer utförlig output
(59k completion-tokens mot 21k), och båda tvingar dessutom verifiern via
tabellen ovan. Det är den enda spaken i mätningen som rör flera kostnader
samtidigt, och därför steg 2 i planen.

### Allt annat är avrundningsfel

De tre landing-versionerna spenderade 1,4–2,0 s på hela efterströmskedjan.
Orkestreringen — scaffold-matchning, route-plan, contracts, BuildSpec,
capability-inferens, dossier-selektion — syns inte alls, vilket stämmer med
koden: `selectDossiersForRequest` är ett uppslag i en mtime-cachad registry, och
`inferCapabilities` är regex.

## Varför "tre agenter" inte är svaret, och vad som är det

Uppdelningen bild / kod / dossier fördelar arbete som är 0 % / ~99 % / ~0 %. Två
av tre workers skulle vara klara innan de börjat.

Den enda splitten som biter på 79–99 % är att dela **koden** — per fil eller per
route, efter en billig kontraktspass som låser designtokens, delade komponenter
och `package.json`. Det är en riktig vinst på pappret, och det är också det
enda i den här planen som kostar mer än timmar. Det ligger i
[`02-parallell-codegen.md`](02-parallell-codegen.md) som en beslutspunkt, inte
som beställt arbete.

## Uppskattad vinst

| Åtgärd | Blogg init (414 s) | Landing init (159 s) | Follow-up (47–71 s) |
|---|---|---|---|
| Steg 1 mätning | ±0 | ±0 | ±0 |
| Steg 2 klassning, output −20 % | −65 s | −31 s | −10 s |
| Steg 3 verifier ur F2 | −69 s | 0 (redan skippad) | 0 (redan skippad) |
| **Steg 1–3 tillsammans** | **~280 s (−32 %)** | **~128 s (−20 %)** | ~40–60 s (−15 %) |
| Steg 4 ovanpå | ~170–190 s (−55 %) | ~80–100 s (−40 %) | sannolikt sämre |

Steg 3 ger bara något på körningar där verifiern faktiskt triggar — här en av
fyra. Steg 2 antar att en femtedel av outputen går att ta bort utan
kvalitetstapp, vilket är en hypotes och inte en mätning.

## Vad som INTE är verifierat

- Urvalet är fyra versioner från två chattar, båda F2. Inga F3-körningar, inga
  imports, inga plan-mode-turer.
- Verifier-observationen vilar på **en** körning.
- Att 20 % av outputen kan tas bort utan kvalitetstapp är obevisat.
- Att bloggsajten var felklassad som `premium`/`heavy` är en bedömning, inte ett
  fastställt fel — trösklarna i `deriveBuildSpec` kan ha goda skäl som
  mätningen inte ser.
- Vinstsiffrorna för steg 4 är räknade, inte uppmätta: strömtid delad på tre
  plus påslag för kontraktspass, skew mellan workers och merge.

## Sidofynd: en defekt som inte hör till den här planen

Chatt `41be90f2` har tre versioner som alla står kvar i `verifying` / `draft`.
v3 loggade `quality-gate:promote-guard-unavailable` — "Build checks passed but
the promotion guard could not verify the finalize signal; promotion deferred
(retryable)". Grinden gick alltså igenom men befordran skedde aldrig. Det är en
korrekthetsbugg och hör till `BUG-SWARM-BACKLOG.md`, inte hit.
