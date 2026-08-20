# Handoff 2026-08-20 — start här

Status: Active
Skriven: 2026-08-20 efter nattens kodvågor + housekeeping
Bas: `origin/master` `dbfcfe7e3`

Nattens arbete är **klart och mergat**. Det här är inte en räddningsplan —
det är nästa fas. Läs den här filen först. Nattens körorder i
[`../2026-08-19-overlamning/`](../2026-08-19-overlamning/00-master-plan.md)
är historik — följ inte dess Startprompt. Enda levande filen där är
[`live-review-blockers.md`](../2026-08-19-overlamning/aktiviteter/live-review-blockers.md).
Levande styrdokument för nästa arbete: dossier-planen och briefing-planen.

Buggsanning: [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)
(25 öppna rader i Aktiv kö). Fattade beslut:
[`docs/decisions/README.md`](../../../decisions/README.md).

## Läget just nu

| Yta | Läge |
|---|---|
| Huvudcheckout | `master` = `origin/master` `dbfcfe7e3` |
| Öppna PR:er | Bara [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) `feat/live-review-critic` — **blockerad** |
| Worktrees | Huvudcheckout + `C:\Users\jakem\Desktop\sajtmaskin-a-live-review` (behåll tills #1052 är avgjord) |
| Lokala brancher som ska finnas | `feat/live-review-critic`, `review/1052-live` |
| Feature-flaggor som ska vara av | `SAJTMASKIN_LIVE_REVIEW`, `SAJTMASKIN_DOMAIN_PURCHASE` |

## Vad som redan är gjort — skicka ingen agent hit

Stabiliseringsvåg 0 och buggvågor 1–3 är mergade: **#1053–#1068**.
Housekeeping landade i `dbfcfe7e3` (backlog-arkiv, plan-synk, worktree-städ).

| SM / sak | PR | Residual |
|---|---|---|
| Prompt-assist-tak, AI SDK, scaffold-ton, capability-map | #1053–#1057 | — |
| Lanseringskort → Versionsdiagnostik | #1058 | — |
| Init-promptlogg får `chat_id` efter chat-create | #1059 | — |
| Källkvitto ärligt | #1060 | — |
| Postcheck behandlar inte boot-sida som `productBlocked` medan hosten startar | #1061 | — |
| Kostnadsrapport = ledger `cost_microusd` | #1062 | — |
| Fly-install: `classifyInstallFailure` | #1063 | Rotorsak till exit **254** öppen — `SM-035` |
| Next 16.3 HMR-path `/_next/hmr` | #1064 | CI kan inte fånga Next-drift (`preview-host` saknar Next-dep) — residual, **ingen ny kö-rad** |
| Footer-copyright-år | #1065 | — |
| Repair sparar inte om skyddad path fortfarande saknas | #1066 | — |
| F2-prompt: märk demo-formulär `data-demo-only` | #1067 | Prompt-only residual |
| Backoffice visad grind = finalize + latest postcheck-overlay | #1068 | Kolumn + promote-guard **orörda** (väg 2) |

Två saker är **beslutade och får inte «förbättras»**: knappen «Bygg
integrationer» stannar (2026-08-17) och `SELECTED_SECTION_CHAR_CAP = 480` är
ett skydd mot att Avoid svälts, inte en defekt (2026-08-19).

## Nästa arbete — välj ett, kör inte tre parallellt

Fråga ägaren vilket spår. Default om hen säger «kör»: **D2**.

| Spår | Vad | Styrdokument | Samtidighet |
|---|---|---|---|
| **D — Dossier** | D2 → D3 → D4. D5 = ägarbeslut, bygg inte | [`../2026-08-19-dossier-forenkling/00-master-plan.md`](../2026-08-19-dossier-forenkling/00-master-plan.md) | **Strikt sekventiellt.** Alla tre skriver `capability-map.json` + `docs/generated` |
| **L — Live-review** | P1-härdning av #1052, sedan P2 före flaggan på | [`../2026-08-19-overlamning/aktiviteter/live-review-blockers.md`](../2026-08-19-overlamning/aktiviteter/live-review-blockers.md) | En agent. Flaggan av tills P2 är klar |
| **B — Backlog** | En rad ur Aktiv kö. Förstahand: `SM-035` (rotorsak), `SM-063` (trasiga bilder), `SM-001`–`SM-003` (repair) | [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) § Aktiv kö | En rad per PR. Via `/kedja` |
| **K — Briefing** | B2, B4–B7. Väntar N1-resten / N2–N5 | [`../2026-08-18-briefing-och-kallpaket/00-master-plan.md`](../2026-08-18-briefing-och-kallpaket/00-master-plan.md) | Bygg inte B2/B7 utan beslut |

### D2 i ett stycke

`configInputs` + `providerSetup` in i schemat. Inte startad. Cloud-OK.
Efter D2: D3 slår ihop promptblocken till `HardDossierIntegration`. D4 sätter
`selected-sections` på alla nio hard — läs 480-beslutet först. D5 fri
add/remove i Backoffice väntar ägaren.

### #1052 P1 före merge

1. Knyt LLM-usage till generationen (`runWithLlmUsageContext`).
2. Misslyckanden: `ok: false` + stabil `errorCode`. Inget tyst pass.
3. Kräv en faktiskt bifogad http(s)-bild. Relativ fallback-URL får inte
   göra `hasCurrentScreenshots` sann.

P2 före flaggan på: Blob-retention/ägarskap, idempotens + kostnadstak,
OpenClaw-befogenheten `live_review` ska faktiskt gatera, synka
`maxDuration` 180 (PR-body) vs 300 (kod).

Lokal spec `.cursor/swarms/SPEC-2026-08-19-live-review.md` är gitignorerad
och dör med maskinen. Kopiera inte in den förrän #1052 är avgjord.

Kritikern förblir advisory — ingen ny repair-agent i samma PR.

## Bygg inte / rör inte

| Sak | Varför |
|---|---|
| D5 fri add/remove | Väntar ägarbeslut |
| Ta bort «Bygg integrationer» | Beslut 2026-08-17 |
| Ta bort 480-taket | Beslut 2026-08-19. Siffran är öppen avvägning, inte en defekt |
| Slå på `SAJTMASKIN_LIVE_REVIEW` | P1+P2 ovan först |
| Slå på `SAJTMASKIN_DOMAIN_PURCHASE` | `SM-007` är en grind, inte tolv lösa buggar |
| Merga #1052 | Blockerad tills P1 + ny review |
| Ema-PR (`EmaCodeHero`) mot master | Retargeta till `ema`. Ägaren mergar |
| Brancher med `BRA` i namnet | Ägarens frysta backup. Radera/force-pusha aldrig |
| `git checkout` i huvudcheckouten | Delad av andra agenter. Builder: egen worktree från `origin/master` |
| Rå `git worktree remove` | Junction följer `node_modules` och tömmer huvudcheckouten. Använd `npm run worktree:remove` |

## Ägarbeslut — implementera inte, fråga

| Beslut | Var |
|---|---|
| D5 fri add/remove | Backlog § Väntar |
| Är 480 rätt siffra? | Samma sektion |
| Briefing N1-resten, N2–N5 (B2/B4–B7 väntar) | Briefing-planen + backlog |
| OpenClaw-rotation: gammal 401, ny 200, Render = Vercel | Driftkvittens, skriv aldrig token |
| `Co-authored-by` på agentcommits | Ägarfråga |

## Vem som får skriva vilka filer

Fyra filer gör parallella agenter till konfliktarbete:

- `data/dossiers/_index/capability-map.json`
- `docs/generated/*.md`
- `BUG-SWARM-BACKLOG.md`
- `docs/plans/active/README.md` och `docs/decisions/README.md`

En skrivare i taget på dem. Dossier-spåret äger de två första medan D2–D4
körs.

## Hur du startar

**Scout:** läs, kartlägg, föreslå. Rör inga filer.

**Builder:** worktree från `origin/master`, inte från lokal HEAD:

```powershell
git worktree add ..\sajtmaskin-a-<kort> -b <typ>/<kort> origin/master
npm run worktree:link -- ..\sajtmaskin-a-<kort>
```

En PR mot master. Du mergar inte. Bugbot-pass på egen diff före PR
(`model` enligt `subagent-models.mdc` — nu `cursor-grok-4.6-xhigh-fast`).
`merge:ready` först efter sign-off-kommentar; `gh pr checks` visar **inte**
bot-fynd. Codex «usage limit» är inte ett fynd.

**Steward:** landa redo PR:er enligt `pr-merge.mdc`. 7 min + externa botar.
Skriv inte features.

### Startprompt (klistra in)

```text
Du är Builder i Sajtmaskin. Utgå från origin/master (dbfcfe7e3 eller nyare).

Läs docs/plans/active/2026-08-20-handoff/00-master-plan.md först.
Uppdrag: <D2 | #1052 P1 | SM-NNN>.
Läs också det styrdokument handoffen pekar på, plus .cursor/rules/
(workflow, git, pr-merge, agent-worktree, response-format, subagent-models,
mvp-scope-freeze).

Egen branch från origin/master. En PR mot master. Du mergar inte.
Bredda inte scope. Bygg inte D5. Slå inte på live-review eller domänköp.
```

Cloud: samma text. Pod-fällor (Postgres-cert, injicerad `REDIS_URL`,
saknad Fly, `OPENAI_API_KEY`-kvot) står i
[`docs/runbooks/cursor-cloud-agent.md`](../../../runbooks/cursor-cloud-agent.md).

## När den här filen är inaktuell

När ägaren valt spår och det har egen levande plan: väv en rad i
[`../../avklarat/README.md`](../../avklarat/README.md) och radera den här
mappen. Lämna inte två «start här»-filer.
