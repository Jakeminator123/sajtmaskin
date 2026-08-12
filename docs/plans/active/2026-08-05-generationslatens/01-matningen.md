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
`duration_ms` minus summan av `meta.postStreamSteps`.

**Rättelse 2026-08-05 (bugbot-fynd under steg 1):** den ursprungliga texten här
påstod att derivatet även rymmer Deep Brief och orkestrering. Det stämmer inte.
`duration_ms` sätts som `Date.now() - startedAt` i `persistTelemetryRecord` och
`streamMs` som `finalizePipelineStartedAt - startedAt` (`runner.ts`) — **samma
ankare**, `engineStartedAt` i `generation-stream.ts:214`. Derivatet och den nya
direktmätningen startar alltså på samma punkt och är jämförbara. Skillnaden är
bara att derivatet dessutom absorberar finalize-tid som inte är uppdelad i
`postStreamSteps` (persist, partiell filreparation, glapp), så det är något
**större** än `streamMs` — inte brief-uppblåst.

**Verifierat 2026-08-05 (steg 2): Deep Brief och orkestrering ligger före
`engineStartedAt`.** Planens totaler (414 s osv.) och andelen "strömmen är
79–99 %" täcker bara fönstret från strömstart — **inte** användarens hela
väntan. Det som saknas i båda fälten:

| Steg | När | Bevis |
|---|---|---|
| Klientstyrd Deep Brief | **Separat HTTP-request före** create-chat-strömmen | `useInitBrief.ts:118` → `POST /api/ai/brief`; statusraden säger uttryckligen "innan own-engine startar" (`:116`) |
| Server auto-brief | Inuti create-chat, **före** orkestrering | `create-chat-stream-post.ts:289–341` (`shouldRunServerAutoBrief` → `tryGenerateServerAutoBrief`) |
| Scaffold-embeddings | Inuti `resolveOrchestrationBase` | `resolve-base.ts:259–264` (`matchScaffoldAuto` med `useEmbeddings`) anropas från `create-chat-stream-post.ts:804` |
| Variant-embeddings | Inuti `finalizeOrchestrationPrompts` | `finalize-prompts.ts:86–97` → `resolveScaffoldVariant` → `pickScaffoldVariantAsync`; anropas från `create-chat-stream-post.ts:936` |
| `pipelineStream` skapas | Efter allt ovan | `own-engine-pipeline-generation.ts:80` (`createGenerationPipeline`) |
| `engineStartedAt` | Omedelbart därefter | `generation-stream.ts:214` i `createOwnEngineGenerationStream`, anropat från `:102` / create-chat `:1024` |

Obs: `sajtmaskin_prompt_to_done_ms` ankrar i `requestStartedAt`
(`create-chat-stream-post.ts:1088–1089`) och fångar server-brief + orkestrering
fram till `done`, men **inte** klientens `/api/ai/brief`. Planens tabell nedan
kommer från `generation_telemetry.duration_ms`, inte från den metriken.

## Vad mätningen visar

Fyra versioner, två chattar, båda F2/`design`, alla med `finalizePath: full`.

| Körning | Scaffold / modell | Totalt (från strömstart) | Före finalize (**ström**, se rättelsen ovan) | Efter ström | Varav verifier |
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

### 3. Klassningen är den gemensamma nämnaren — och den är befogad

En bloggsajt fick `qualityTarget: premium` + `contextPolicy: heavy`. Landing-
sajten fick `standard` + `normal` och tog en tredjedel så lång tid.

Den klassningen betalar sig tre gånger om: `heavy` context ger 121k
prompt-tokens mot landing-sajtens 20k, `premium` target ger mer utförlig output
(59k completion-tokens mot 21k), och båda tvingar dessutom verifiern via
tabellen ovan. Steg 2 utredde om det var felklassning.

**Dom (kodbevis, ingen tröskeländring):** skillnaden blog ↔ landing är
**medveten avvägning**, inte en bug.

| Signal | Villkor | `fil:rad` | Blogg-relevans |
|---|---|---|---|
| `qualityTarget: premium` via multipage | `routeCount > 1` på init | `policy-inference.ts:274–283` | Blog-scaffold lägger `/blog` (`planning-helpers.ts:303–309`) → minst två routes med `/`. Mätta körningen hade `changeScope: page-addition` (= `routes.length > 1`, `policy-inference.ts:152`) |
| `qualityTarget: premium` via `content-heavy` | `siteType === "content-heavy"` | `policy-inference.ts:262` | `inferSiteType` sätter det först vid `routeCount > 5` (`route-plan-builder.ts:20–24`) |
| `qualityTarget: premium` via brief | `brief.qualityBar` ∈ {`premium`,`bold-dramatic`} | `policy-inference.ts:234–245` | Kan ha bidragit om Deep Brief satte qualityBar |
| `contextPolicy: heavy` | `score >= 3` (tröskel sänkt Q5b) | `policy-inference.ts:396–397`, `:528–530` | Multipage ensamt räcker **inte** — tre-sidors brochure stannar på `normal` (`build-spec.test.ts:413–431`). Heavy kräver t.ex. init(+1)+content-heavy-struktur(+2), eller init(+1)+brief.premium(+1)+≥3 routes(+1), eller `capabilityHeavy` (tvingar heavy, `:503–513`) |
| Landing `standard`/`normal` | en route, inga tunga signaler | samma filer | `siteType: one-page`, `routeCount === 1` → ingen multipage-promotion, score ≈ 1 |

Testkommentaren i `build-spec.test.ts:413–418` slår fast att multipage→premium
infördes medvetet ("under-spent the budget"). Q5b-kommentaren
(`policy-inference.ts:391–393`) accepterar fler `heavy`-fall mot färre
trunkeringar. Att sänka trösklarna är därför ett kvalitets-/ägarbeslut, inte
en defektfix — steg 2 levererar diagnosen och stannar.

### Spaken finns redan: `heavy`-tröskeln är env-styrd

`CONTEXT_POLICY_HEAVY_THRESHOLD` läses ur miljön
(`policy-inference.ts:396–397`), och Q5b-kommentaren anger uttryckligen
`SAJTMASKIN_CONTEXT_POLICY_HEAVY_THRESHOLD=4` som vägen tillbaka till det gamla
beteendet. Vill ägaren pröva om `heavy` är för generöst behövs alltså **ingen
kodändring** — sätt env-värdet i Vercel, deploya, och jämför. Det är den tråkiga
robusta varianten framför en tröskelrefaktorering.

En A/B avgörs på tre observerbara signaler per körning, alla i
`generation_telemetry`: `meta.buildSpec.contextPolicy` (blev det `normal`?),
`prompt_tokens`/`completion_tokens` (sjönk volymen?) och `meta.streamMs` (blev
strömmen kortare?). Alla tre finns i `generation_telemetry` sedan steg 1.
Kvalitetssidan avgörs inte av dem — den kräver
att ägaren tittar på de genererade sajterna, eftersom Q5b-kommentaren säger att
tröskeln sänktes just för att undvika `"section truncated"`-fall.

**Docs-lucka (följdarbete, inte del av steg 2):** variabeln finns bara i koden.
Den är inte registrerad i `docs/ENV.md` eller `config/env-policy.json`, så
`npm run env:audit` känner inte till den och ingen kan hitta spaken utan att
läsa `policy-inference.ts`. Registrering kräver rätt sektion i env-policyn och
bör göras som en egen liten ändring.

### Allt annat är avrundningsfel (inom strömfönstret)

De tre landing-versionerna spenderade 1,4–2,0 s på hela efterströmskedjan.
Orkestreringen syns inte i `duration_ms`/`streamMs` eftersom den ligger **före**
`engineStartedAt` (se verifieringen ovan). Inom själva orkestreringen är
dossier-valet fortfarande billigt: `selectDossiersForRequest` är ett uppslag i
en mtime-cachad registry, och `inferCapabilities` är regex — men
scaffold-/variant-embeddings är nätverksanrop som användaren väntar på *innan*
tabellens klocka startar.

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
| Steg 2 klassning | ±0 (befogad — ingen tröskeländring) | ±0 | ±0 |
| Steg 3 verifier ur F2 | −69 s | 0 (redan skippad) | 0 (redan skippad) |
| **Steg 1–3 tillsammans** | **~345 s (−17 %)** om steg 3 tas | **~159 s** | ~47–71 s |
| Steg 4 ovanpå | ~170–190 s (−55 %) | ~80–100 s (−40 %) | sannolikt sämre |

Steg 3 ger bara något på körningar där verifiern faktiskt triggar — här en av
fyra. Steg 2:s tidigare −20 %-hypotes utgår; klassningen lämnas orörd.

## Vad som INTE är verifierat

- Urvalet är fyra versioner från två chattar, båda F2. Inga F3-körningar, inga
  imports, inga plan-mode-turer.
- Verifier-observationen vilar på **en** körning.
- Exakt vilken tung-signal (brief.qualityBar vs content-heavy vs
  capabilityHeavy vs complexityScore) som bar `heavy` på `9cdb3e31` v1 kräver
  den körningens `meta.buildSpec`/`contextPolicyScore` från prod — koden visar
  bara vilka villkor som *kan* ha träffat. Domslutet "befogad" vilar på att
  varje kandidatvillkor har dokumenterad avsikt, inte på live-meta.
- Vinstsiffrorna för steg 4 är räknade, inte uppmätta: strömtid delad på tre
  plus påslag för kontraktspass, skew mellan workers och merge.

## Sidofynd: en defekt som inte hör till den här planen

Chatt `41be90f2` har tre versioner som alla står kvar i `verifying` / `draft`.
v3 loggade `quality-gate:promote-guard-unavailable` — "Build checks passed but
the promotion guard could not verify the finalize signal; promotion deferred
(retryable)". Grinden gick alltså igenom men befordran skedde aldrig. Det är en
korrekthetsbugg och hör till `BUG-SWARM-BACKLOG.md`, inte hit.
