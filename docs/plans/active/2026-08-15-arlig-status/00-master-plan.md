# Ärlig status — styrdokument

Status: Active
Startad: 2026-08-15
Ägarbeslut: 2026-08-15 (se § Beslut)

## Kärnprincip

**Byt gissningar om varaktighet mot frågor till något som vet. Och låt aldrig
en statusflagga påstå mer än den har mätt.**

Två prod-utredningar 2026-08-14 visade samma mönster i två olika skepnader: kedjan
är full av tidsgränser som *antar* hur lång tid ett steg tar, och statusflaggor som
sätts av något annat än det de påstår sig beskriva. Varje punkt nedan finns för att
ta bort en gissning eller en lögn — inte för att lägga till en funktion.

Höj **inte** en tidsgräns som "fix". Det flyttar bara myntkastet.

## Bevisunderlaget

| Spår | Symptom | Rotorsak (verifierad) |
|---|---|---|
| 1 | Mobilprompt gav ingen sajt alls, tyst | Generationen bor i HTTP-anslutningen. Bryts den faller klienten tillbaka till `POST /api/engine/chats`, som saknar `maxDuration` → `504` efter ~30 s. Inget kunde loggas: `engine_version_error_logs.version_id` är `NOT NULL` |
| 2 | Sajt byggdes men previewen visade gammal/trasig kod | Preview-hosten (Fly) körde v54 från 12 aug och saknade tolv mergade runtime-swap-fixar. **Åtgärdat 2026-08-14 21:18 → v55** |
| 3 | Omkörning efter v55: sajten renderar, men "Slutsteg · fel" | `/tmp` hade **6 MB fritt av 525** när produktkontrollens Chromium startade; kontrollen gav upp **0,9 s** innan runtimen blev klar; verifieraren läste modellens utkast till `package.json` i stället för den mergade |

Nyckeltider ur körning `6e865848-8df5-46e9-aa81-c52ce7221d07`:

```text
21:41:08.000Z  [capture-browser] free space in temporary directory: 6MB of 525MB
21:41:14.000Z  Thumbnail capture skipped — boot placeholder is still showing
21:41:15.616Z  Fly: install klar, ny runtime startar (port 4162)
21:41:33.135Z  Produktkontroll ger upp → preview_boot_page → productBlocked
21:41:34.060Z  Fly: Runtime ready       ← 0,9 s för sent
21:42:21.542Z  Automatic quality gate passed        ← grönt trots ovanstående
```

Repo-brett (`dump-logs --kinds=defects`, utan `--chat`): `product_postcheck.skipped`
36 gånger över 14 chattar, `preview_boot_page` 5/4, hydreringsfel 31/7,
`npm install exit 254` 11/3 (sistnämnda utan ny förekomst efter Fly v55).

## Beslut (ägaren, 2026-08-15)

| # | Fråga | Beslut |
|---|---|---|
| B1 | Readiness kunde visa `PASS` samtidigt som produktkontrollen blockerade | **Readiness ska bli röd när produktkontrollen blockerar.** En sanning, strängare hållning |
| B2 | T3 kräver schemaändring i prod-databasen | **Godkänt** — men migrationen ska följas upp och **valideras mot prod efteråt**, inte antas fungera |
| B3 | Tidsgränser | Höj aldrig en gräns som lösning. Fråga den som vet |

Registrera B1 i [`docs/decisions/README.md`](../../../decisions/README.md) när den
implementerats.

## Vågor

Varje punkt är en egen PR. Punkter i samma våg rör olika filer och kan köras
parallellt; nästa våg startar först när föregående mergat.

### Våg 1 — inga beslut behövs

| Id | Uppgift | Kanonisk ägare |
|---|---|---|
| T1 | `/tmp`-spegelns tak: antal → byte | `src/lib/logging/event-bus.ts` |
| T2+T4 | Skilj "fick inget svar" från "Fly visar startsidan", och fråga readiness i stället för att polla HTML | `src/lib/capture/preview-boot-page.ts`, `src/lib/gen/verify/product-postcheck.ts` |
| T6 | `fix-failed` på ett **rådgivande** fynd får inte färga hela Slutsteg rött | `src/lib/hooks/chat/stream-handlers-progress.ts` |
| T12 | Runbookens drain-ordning: env + deploy **före** drainen skapas | `docs/runbooks/vercel-log-drain.md` |

### Våg 2 — efter våg 1

| Id | Uppgift | Kanonisk ägare |
|---|---|---|
| T5 | Verifiera den **mergade** `package.json`, inte modellens utkast | `src/lib/gen/stream/finalize-version/`, `src/lib/gen/export/project-scaffold.ts` |
| T7 | Implementera B1 — readiness respekterar `productBlocked` | `src/lib/chat-readiness.ts` |
| T8 | Fasmätningen (`reasoning 0.3s` för en 337 s ström) | `src/lib/gen/stream/stream-format.ts` |
| T9a | Reservvägen ska inte starta en ny generering mot en rutt utan tidsgräns | `src/lib/hooks/chat/useCreateChat.ts`, `src/app/api/engine/chats/route.ts` |
| T10 | Ta generation-låset **före** chat-raden skapas | `src/lib/api/engine/chats/create-chat-stream-post.ts` |

### Våg 3 — kräver ägaren närvarande

| Id | Uppgift | Varför den väntar |
|---|---|---|
| T3 | Fel loggbara utan version (`version_id` nullable eller egen tabell) | Prod-migration. Godkänd enligt B2, men kräver validering mot prod efteråt |
| T9b | Flytta codegen ut ur HTTP-anslutningen (resume i stället för omstart) | Arkitekturbeslut → `/818` |
| T11 | Skapa loop-säker Vercel-drain | Kräver prod-deploy + infra som tidigare orsakat en kostnadsincident |

## Vad varje agent måste leverera

Ingen PR är klar utan alla fem:

1. **Ändra den kanoniska ägaren** — inte fem konsumenter. Se
   [`pipeline-rules.mdc`](../../../../.cursor/rules/pipeline-rules.mdc).
2. **Test som låser fixen.** Ett test som skulle ha fångat defekten.
3. **Docs speglar runtime.** Ersätt gammal text; lägg inte ett lager ovanpå.
   Rörs genererade ytor: `npm run docs:generate` + `npm run docs:check` +
   `npm run docs:links`.
4. **Radera den gamla logiken.** Ersätts en mekanism ska den bort, inte ligga
   kvar bakom en flagga.
5. **Verifiering:** `npm run typecheck` + riktad vitest på det som rörts.

Arbeta i **egen git-worktree** (`git worktree add ..\sajtmaskin-<id> -b fix/<id>`).
Huvudcheckouten tillhör ägaren — byt aldrig branch där. Städa med
`npm run worktree:remove -- <sökväg>`, aldrig rå `git worktree remove`. Se
[`agent-worktree.mdc`](../../../../.cursor/rules/agent-worktree.mdc).

## Merge-grinden

Kanonisk: [`pr-merge.mdc`](../../../../.cursor/rules/pr-merge.mdc). Sammanfattat:
bugbot-pass på aktuell head-SHA → sign-off-kommentar → **sedan** `merge:ready`-label
→ PR ≥ 7 min → alla required checks gröna → varje bot-fynd fixat, loggat eller
avfärdat. Faller ett villkor: `NEEDS_HUMAN`.

Nästan allt i planen rör protected paths (`src/lib/gen`, `src/lib/logging`,
`src/app/api`, `src/lib/db`), så **varje** PR kräver ett oberoende bugbot-pass.

Underagenter körs med `cursor-grok-4.6-xhigh-fast` enligt
[`subagent-models.mdc`](../../../../.cursor/rules/subagent-models.mdc) — även bugbot.

## Framsteg

Orkestratorn rapporterar ungefärlig färdiggrad efter varje batch.

| Batch | Punkter | Status | Klart (ca) |
|---|---|---|---|
| Förarbete | Fly v55 utrullad, drain-brytare satt, plan skriven | Klar | 15 % |
| Våg 1 | T12 (#999 → `82349593d`), T1 (#1000 → `82310ba80`), T6 (#1001 → `362e87e12`), T2+T4 (#1002 → `6e27c61c2`) | **Klar** | 45 % |
| Våg 2a | T7 (#1003 → `9b7478112`), T8 (#1004 → `0e00df219`), T5 (#1005 → `39c7cec68`) | **Klar** | 75 % |
| Våg 2b | T9a (#1006 → `3754c0d51`), T10 (#1007 → `0f7a1dc6e`) | **Klar** | 90 % |
| Våg 2c | T9c (#1008 → `951722ebd`) — samma dömda reservväg för **uppföljningar**. Upptäckt av T9a-agenten, verifierad av orkestratorn: `[chatId]/messages` saknade `maxDuration` medan syskonrutterna har 950. Utan den vore spår 1 bara halvfixat — skapa hade fungerat, redigera inte. | **Klar** | 100 % av planen |

Allt i vågorna 1-2 är mergat. Kvar är bara de tre punkterna i våg 3, som alla
kräver ägaren.

## Sidospår som orkestratorn tog över (ägarbegäran 2026-08-15)

Två PR:er från andra agenter låg och blockerade. Ägaren bad merge-agenten ta över
dem så att författaragenterna kunde vila.

| PR | Vad orkestratorn gjorde |
|---|---|
| #994 Block/Marknadsblock | Buggpasset hittade att felytan i Block-fliken renderades **i stället för** listan. Eftersom `items` initialiseras med de åtta fröna och aldrig är tom dolde ett hämtningsfel åtta fungerande kort. Fixat genom att lägga felet i den befintliga rubrikytan; testfil som saknades tillagd. Mergad som `72abd4b53`. |
| #997 sidtak | Konflikten var en modify/delete: `nattbatch-2026-08-14-restlista.md` raderades i master (planarkivering) men ändrades i branchen. Masters avsikt vann — filen var en projektion av data som ägs av `BUG-SWARM-BACKLOG.md`. PR:en hade legat 24 h medan elva andra landade, så innehållet omverifierades (208 tester, typecheck, bugbot) innan merge. Ägaren tog bort `agent:needs-human`-spärren uttryckligen. Mergad som `80135a6a4`. |
| #1009 dossier-plan | Docs-only plan från en tredje agent. Konflikt två gånger i **samma** fil — `docs/plans/active/README.md`, planregistret som båda spåren skriver i. Före merge verifierades att konfliktlösningen bara la till en rad och inte tappade masters egna: diffen var exakt `+1`. Mergad som `7d499fc68`. |

Våg 2 delades i två efter våg 1:s erfarenhet: T9a och T10 rör båda
`src/lib/api/engine/chats/`, och två PR:er i samma fil tvingar en ombasering av
den som mergas sist. #1000 och #1001 rörde båda
`docs/architecture/runtime-contracts.md` och klarade sig bara för att mergarna
serialiserades.

Granskningen fångade **åtta** riktiga defekter i våg 1 — fem i runbooken som redan
låg på master (självtestet kunde aldrig passera sin egen grind), och tre i ny kod,
varav ett nytt falsk-grönt i just den PR som skulle ta bort falsk-grönt
(`isHostRuntimeReady` lät `readinessState: "ready"` överrösta ett explicit
`httpReady: false`). Ingen av dem hade fångats av grön CI.

Empiriskt fastställt 2026-08-15 med skarpa Vercel-anrop, vilket ändrade T11:
`POST /v1/drains/test` avvisar fältet `sampling` (400), så loop-brytaren **kan inte
förvalideras**. Därför är säker default en mottagare i ett annat projekt, inte en
same-app-drain med en overifierad sampling-regel.

## Related

- Loggkällor: [`.cursor/skills/logg/SKILL.md`](../../../../.cursor/skills/logg/SKILL.md)
- Drain-runbook: [`docs/runbooks/vercel-log-drain.md`](../../../runbooks/vercel-log-drain.md)
- Preview-host: [`preview-host/README.md`](../../../../preview-host/README.md)
- Buggsanning: [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
