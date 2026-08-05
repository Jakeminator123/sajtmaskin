# Ägarbeslut — register

**Kanoniskt register över fattade ägarbeslut.** Väntande beslutsfrågor ägs av
[`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md); planstatus av
[`docs/plans/`](../plans/README.md). Registret är gällande läge, inte historik:
vänds ett beslut uppdateras raden där motiveringen står — git är arkivet.
Raderna pekar på den kanoniska källan (kontrakt, policyfil, kod eller test) där
innebörden bor; registret kopierar inte implementation.

## Flöde

1. En öppen beslutsfråga ligger som rad i backloggen (kön för ägarbeslut).
2. Ägaren beslutar — i chat, PR-review eller ratificering av delegerade förslag.
3. Beslutet får en rad här med datum, innebörd och kanonisk källa; backloggraden
   arkiveras med pekare hit.
4. Kontraktet/koden/testet som bär beslutet uppdateras i samma PR när det går.

Beslutsrader utan denna landningsplats tenderar att bli permanenta pseudobuggar
i backloggen — registret finns för att beslut ska kunna stängas.

## Gällande beslut

| Datum      | Område              | Beslut                                                                                                                                                                                                                                                  | Kanonisk källa                                                                                                                                                                              |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Dossierkontrakt     | Providernyckeln `openai` får den generiska LLM-vägen — vid tvetydiga manifest väljs aldrig ett godtyckligt syskon (tidigare injicerades både `openai-chat` och `ai-tool-calling-chat`). Testlåst och mutationsverifierat (#785)                         | [`docs/contracts/dossier-system.md`](../contracts/dossier-system.md) + `provider→dossier contract lock` i [`tier3-build-spec.test.ts`](../../src/lib/integrations/tier3-build-spec.test.ts) |
| 2026-08-05 | Verktyg/subagenter  | Grok 4.5 är standardmodell för alla Cursor-subagenter, inklusive bugg-/kodgranskning; slug slås upp per session (#790, #796)                                                                                                                            | [`.cursor/rules/subagent-models.mdc`](../../.cursor/rules/subagent-models.mdc)                                                                                                              |
| 2026-08-04 | Release             | Revisionsgrinden `SAJTMASKIN_CONTENT_REVISION_GATE` släppt i alla Vercel-miljöer (restlistans R14); okänd revision förblir fail-open (beslut 1b)                                                                                                        | [`docs/plans/avklarat/README.md`](../plans/avklarat/README.md) § Innehållsrevision + [`docs/schemas/quality-gate.md`](../schemas/quality-gate.md)                                           |
| 2026-07-30 | Kvalitetsgrind      | Mismatchat verdikt kastas i **båda** riktningar; bara **känd** mismatch blockerar promote, saknad revision är fail-open                                                                                                                                 | [`docs/plans/avklarat/README.md`](../plans/avklarat/README.md) § Innehållsrevision (plantexten i git)                                                                                       |
| 2026-07-30 | Datamodell          | `files_revision` är **hash, genererad av Postgres** (`md5(files_json)`) — ingen skrivare kan glömma den                                                                                                                                                 | samma                                                                                                                                                                                       |
| 2026-07-30 | Leveransordning     | Innehållsrevisionens steg 1–2 levererades separat från steg 3 — additivt först, beteende sen                                                                                                                                                            | samma                                                                                                                                                                                       |
| 2026-07-30 | Telemetri/credits   | En generationsrad beskriver **utfallet, inte det värsta ögonblicket**: en återhämtad 429 får inte skriva `success=false`, och en awaiting-input-runda debiteras lika oavsett blipp (`providerFault` scopas per försök)                                  | [`backlog-arkiv-2026-07-25.md`](../plans/avklarat/bug-swarm/backlog-arkiv-2026-07-25.md) → de två `providerFault`-raderna                                                                   |
| 2026-07-30 | Prissättning        | Tokenmätningen är internt kostnadsunderlag, **inte** debitering: diamonds förblir fast pris per åtgärd; sekundära ytor mäts när de börjar debitera; OpenClaw/D-ID redovisas separat                                                                     | [`scripts/observability/README.md`](../../scripts/observability/README.md) § Vad mätningen är till för                                                                                      |
| 2026-07-29 | Backoffice/modeller | Fas D: tre separata workload-poster i modellmanifestet, ingen sammanslagning; posternas `notes`-fält bär motiveringen                                                                                                                                   | [`config/ai_models/manifest.json`](../../config/ai_models/manifest.json)                                                                                                                    |
| 2026-07-28 | Builder-UI          | ReleaseGate-bannern: **diskret diagnostik-länk**, inte noll spår (noll spår gör UI:t osant) — implementerad i #639                                                                                                                                      | [`docs/plans/avklarat/README.md`](../plans/avklarat/README.md) § Restlistan                                                                                                                 |
| 2026-07-28 | Capability-ägarskap | Ingen automatisk radering (`REPLACES:`-protokoll) när en dossier tar över en capability en LLM-byggd yta redan täcker — prompt-prevention + Advisory är slutläget, eftersom en felaktig deklaration raderar användarfiler (dataförlust mot mindre brus) | [`BUG-SWARM-BACKLOG.md`](../../BUG-SWARM-BACKLOG.md) § Beslut & policy; den kvarvarande byggvägsfrågan är en egen backloggrad                                                               |

Ratificeringen 2026-07-30 ("jag godkänner alt") omfattade de delegerade besluten
ovan med det datumet; beslut med andra datum togs direkt av ägaren i respektive
PR eller review.
