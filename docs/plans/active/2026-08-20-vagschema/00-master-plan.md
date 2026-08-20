# Vågschema 2026-08-20 — start här

Status: Active
Skriven: 2026-08-20, efter egen omverifiering av nattens våg + extern coachgranskning
Bas: `origin/master` `6354c91c4`

Den här filen äger **körordningen**: vilka uppgifter som finns, vilka som får gå
samtidigt, och vad varje agent får respektive inte får göra. Den äger inte
buggsanningen ([`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md)) och
inte fattade beslut ([`docs/decisions/README.md`](../../../decisions/README.md)).

Ersätter handoffen 2026-08-20 och överlämningen 2026-08-19 — båda mapparna är
raderade, historik finns i git och i
[`../../avklarat/README.md`](../../avklarat/README.md).

## Läget (verifierat 2026-08-20)

| Yta | Läge |
|---|---|
| `origin/master` | `6354c91c4` + [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) (`2078883723`, mergad 2026-08-20T20:18Z) |
| Öppna PR:er | **Inga.** Kön är tom |
| Flaggor som ska vara av | `SAJTMASKIN_LIVE_REVIEW`, `SAJTMASKIN_DOMAIN_PURCHASE` |
| Aktiv kö i backloggen | 31 öppna rader efter saneringen 2026-08-20 (fem residualrader + `SM-070` live-review-grinden) |

## Vad som redan är gjort — skicka ingen agent hit

Stabiliseringsvåg 0 och buggvågorna 1–3 är mergade: **#1053–#1068**.
Öppna, granska eller "förbättra" inte de PR:erna igen.

| Sak | PR | Residual |
|---|---|---|
| Live-review-kritiker steg 1, advisory bakom avstängd flagga | #1052 | Aktiveringsgrinden → `SM-070` + [live-review-planen](../2026-08-20-live-review/00-master-plan.md) |
| Prompt-assist-tak, AI SDK-paritet, scaffold-ton, capability-map | #1053–#1057 | Tyst teckenkapning kvar → [våg 1](#våg-1--bekräftade-masterdefekter) |
| Lanseringskort → Versionsdiagnostik | #1058 | — |
| Init-promptlogg får `chat_id` | #1059 | — |
| Källkvitto ärligt nedåt | #1060 | Kvittot byggs av avsikt, inte skickad payload → [våg 2](#våg-2--sanningsytor-och-ci) |
| Postcheck blockerar inte på boot-sida | #1061 | — |
| Kostnadsrapport = ledger `cost_microusd` | #1062 | — |
| Fly-install: `classifyInstallFailure` | #1063 | Rotorsak till exit 254 öppen → `SM-035`, [våg 3](#våg-3--stabilitet-i-prod) |
| Next 16.3 HMR-path `/_next/hmr` | #1064 | Kontraktstestet skippas i CI → [våg 2](#våg-2--sanningsytor-och-ci) |
| Footer-copyright-år | #1065 | — |
| Repair sparar inte vid `stillMissing` | #1066 | Helt utelämnad skyddad path fångas inte → [våg 1](#våg-1--bekräftade-masterdefekter) |
| F2: märk demo-formulär `data-demo-only` | #1067 | Prompt-only |
| Backoffice visad grind = finalize + postcheck-overlay | #1068 | Fem tooling-läsare läser rå kolumn → [våg 2](#våg-2--sanningsytor-och-ci) |

## Vad omverifieringen visade

Externa granskarens residuallista prövades mot koden på `6354c91c4`. Elva
påståenden, nio höll. Två gjorde det inte — de raderna var **falskt öppna** i
backloggen och är arkiverade i saneringen 2026-08-20.

| Påstående | Dom | Ankare |
|---|---|---|
| Prompt-assist: normal output > 8 000 tecken kapas tyst med 200 | Håller | `prompt-assist-pre-send.ts:65-75` (`clampRewriteText` → `slice`); `finishReason === "length"` ger dock 502 |
| Repair kan spara bort en skyddad path som modellen utelämnar helt | Håller | `protected-paths.ts:101-103` (tom `droppedPaths` = no-op), `repair-execution.ts:225-230, 328-340` |
| Script-varningsfiltret är crawl-globalt, inte route-lokalt | Håller | `product-postcheck.ts:686-695` — `warnings.some(...)` över hela körningen |
| Fem tooling-läsare rapporterar falskt grönt efter `productBlocked` | Håller | `control-stats.mjs:228-232`, `latest-site.mjs:150`, `compare-control-stats.mjs:136-159`, `genlogs/assess.py:221-295`, `dump-logs.mjs:141` |
| Källkvittot kan säga `reachedPrompt: true` när fyra användarbilder trängt bort variantbilden | Håller | `source-receipt.ts:76-89` läser attach-avsikt; `request-metadata.ts:166-186` kapar till fyra, användarbilder först |
| Next-HMR-kontraktet skippas i CI | Håller | `test-preview-proxy-contract.mjs:21-31`; `preview-host/package.json:19-22` saknar `next` |
| Thumbnail: obundna `document.fonts.ready` + boot-probe i en 60 s-rutt | Håller | `thumbnail-capture.ts:419-443`; kontrollerad budget `54_400` ms testlåst |
| `#1049`s färgtokenfix saknar dark-variant-smoke | Håller | bara unit-tester på mapparen (`theme-token.test.ts`) |
| Bug-swarm-indexet säger «högsta `SM-056`, nästa `SM-057`» | Håller | `SM-064` var redan förbrukad → verklig ID-kollisionsrisk. Rättat |
| «AI SDK-majoren skiljer sig mellan appen och genererade sajter» | **Faller** | #1055 riktade båda till `ai ^6.0.239` / `@ai-sdk/openai ^3.0.90` (`dep-completer.ts:269-270`). Raden var falskt öppen |
| «Prompt-assist-routen sätter inget `maxOutputTokens`» | **Faller** | `PROMPT_REWRITE_MAX_OUTPUT_TOKENS = 3_072` sätts (#1053). Raden var falskt öppen |

Dessutom bekräftat: `configInputs` och `providerSetup` finns **ingenstans** i
kod, schema, manifest eller scripts — D2 är inte startad, och `envVars` är den
befintliga, runtime-lästa ägaren av samma fråga. Det är därför D2 måste säga
uttryckligen vad `configInputs` gör i runtime i stället för att bli en andra
sanning bredvid `envVars`.

## Så körs vågorna

**Regeln som gör parallellism möjlig:** ingen fil förekommer hos två agenter i
samma våg. Bryts den blir vågen konfliktarbete i stället för utveckling.

**En våg startar när föregående är mergad** — inte när den är öppnad.

Eftersom `#1052` mergades 2026-08-20 föll de flesta beroendena bort. Kvar finns
bara **en** riktig ordningsregel: `SM-036` rör samma verifieryta som `#1052` just
ändrade, så den vill ha master i ryggen.

### Våg 1 — åtta agenter parallellt

Ingen fil förekommer hos två av dem. Kördes som cloud-agenter 2026-08-20 kväll.
Parallellismen höll: noll merge-konflikter mellan de åtta.

| Uppgift | Ägda filer | Läge |
|---|---|---|
| [Prompt-assist kapar tyst](aktiviteter/vag1-prompt-assist-tyst-kapning.md) | `src/lib/builder/prompt-assist-pre-send.ts`, `src/app/api/ai/prompt-assist/route.ts` | **Mergad** — #1070 |
| [Repair sparar bort utelämnad skyddad path](aktiviteter/vag1-repair-utelamnad-skyddad-path.md) | `src/lib/gen/scaffolds/protected-paths.ts`, `src/lib/gen/verify/server-verify/`, repair-routen | **Mergad** — #1072 |
| [Script-varningen döljs över hela crawlen](aktiviteter/vag1-script-varning-per-route.md) | `src/lib/gen/verify/product-postcheck.ts` | **Mergad** — #1071 |
| [Next-HMR-kontraktet skippas i CI](aktiviteter/vag2-next-hmr-ci-lane.md) | `preview-host/`, `.github/workflows/ci.yml` | **Mergad** — #1074 |
| [Grinden visar falskt grönt i tooling](aktiviteter/vag2-quality-gate-overlay-i-tooling.md) | `scripts/db/`, `scripts/observability/` | Öppen PR #1077 |
| [Källkvittot byggs av avsikt](aktiviteter/vag2-kallkvitto-fran-skickad-payload.md) | `src/lib/gen/orchestrate/source-receipt.ts`, `finalize-prompts.ts`, `src/lib/gen/request-metadata.ts` | Öppen PR #1075 |
| [Thumbnail väntar obundet](aktiviteter/vag2-thumbnail-obundna-vantan.md) | `src/lib/projects/thumbnail-capture.ts` | Öppen PR #1073 |
| [`SM-063` trasiga bild-URL:er](aktiviteter/vag3-sm063-trasiga-bild-urler.md) | `src/lib/utils/image-validator.ts`, `src/lib/gen/validation/project-sanity.ts`, `src/lib/hooks/chat/post-checks.ts` | Öppen PR #1076 |

Aktivitetsfilerna för de fyra mergade raderna kan raderas när hela vågen är
landad — arkivnoterna i backloggen bär då sanningen.

Filnamnens `vag2-`/`vag3-`-prefix är från det ursprungliga schemat, som antog att
`#1052` låg kvar. Den här tabellen äger vågindelningen — inte filnamnen.

### Våg 2 — efter våg 1

| Uppgift | Ägda filer | Varför den väntar |
|---|---|---|
| [`SM-036` verifierarens falska blockerare](aktiviteter/vag3-sm036-verifier-falska-blockerare.md) | `src/lib/gen/stream/finalize-version/`, verifier-vägen | Samma verifieryta som `#1052` nyss ändrade |
| `SM-064` sköldknappens wrapper (P3, ingen egen aktivitetsfil — backlograden räcker) | `src/components/openclaw/OpenClawPowersControl.tsx` | `#1052` rörde filen; ta den mot färsk master |

### Utanför vågorna

| Uppgift | Not |
|---|---|
| [`SM-035` Fly install exit 254](aktiviteter/vag3-sm035-fly-exit-254.md) | **Inte cloud** — poden saknar Fly-åtkomst. Kör lokalt när som helst; krockar med ingen |
| [Live-review-aktivering `SM-070`](../2026-08-20-live-review/00-master-plan.md) | Grind bakom avstängd flagga. Inte en våg — ett driftbeslut |

### Spår som löper parallellt med vågorna

| Spår | Styrdokument | Samtidighet |
|---|---|---|
| **D — Dossier** | [`../2026-08-19-dossier-forenkling/00-master-plan.md`](../2026-08-19-dossier-forenkling/00-master-plan.md) | D2 → D3 → D4, **strikt sekventiellt**. Kan starta i våg 1: spåret äger `capability-map.json` + `docs/generated/` ensamt |

### Kända kollisioner att planera runt

| Kollision | Hantering |
|---|---|
| Åtta samtidiga PR:er ↔ granskningskapacitet | Den verkliga flaskhalsen är inte git utan att någon triagerar åtta botpass. Merga i den ordning de blir klara, en `gh pr merge` i taget med `git fetch` emellan |
| D-spåret ↔ vem som helst i `docs/generated/*.md` | Generade filer är projektioner: den som mergar sist kör `npm run docs:generate` igen. Lös aldrig konflikten för hand |
| `SM-063` ↔ `SM-068` | Båda rör kvalitetsrapportering men i skilda filer (`src/lib/` mot `scripts/`). Ingen krock |

### Filer som bara en skrivare får röra

| Fil | Ägare under vågkörning |
|---|---|
| `BUG-SWARM-BACKLOG.md` | **Ingen fix-agent.** Raden står kvar tills PR:en mergas; arkivering görs samlat efteråt. Nämn `SM`-id i PR-bodyn i stället |
| `data/dossiers/_index/capability-map.json` | D-spåret |
| `docs/generated/*.md` | Den agent som faktiskt ändrat en manifest-/config-källa |
| `docs/plans/active/README.md`, `docs/decisions/README.md` | Ägaren eller en Steward, mellan vågor |

## Agentkontrakt — gäller varje uppgift här

1. **Egen branch från `origin/master`.** Cloud: agenten får sin egen arbetsyta.
   Lokalt: `git worktree add ..\sajtmaskin-<säte>-<kort> -b fix/<kort> origin/master`
   + `npm run worktree:link -- <sökväg>`. Aldrig `git checkout` i huvudcheckouten.
2. **En PR mot `master`, inte draft.** Öppna den som en vanlig PR — då kan
   ägaren och andra agenter läsa diff, checks och kommentarer direkt, och
   `review-window` börjar räkna.
3. **Eget Bugbot-pass på egen diff, så många omgångar som behövs.** `bugbot`-subagent,
   `readonly: true`, en Grok-modell enligt
   [`subagent-models.mdc`](../../../../.cursor/rules/subagent-models.mdc) — aldrig
   en dyr tänkande modell som default. Kör om på **varje ny commit**.
4. **Sign-off först när du själv skulle godkänna PR:en.** Kommentera på PR:en:
   vad Bugbot hittade, vad du gjorde med varje fynd, och vad du medvetet lämnade.
   Först därefter `merge:ready`.
5. **Du mergar inte.** Merge ägs av ett Steward-säte enligt
   [`pr-merge.mdc`](../../../../.cursor/rules/pr-merge.mdc): ≥ 7 min PR-ålder och
   triagerade externa botfynd. «Usage limit reached» från Bugbot eller Codex
   betyder att granskaren är av — inte att det saknas fynd.
6. **Bredda inte scope.** Hittar du något utanför uppgiften: skriv det i PR-bodyn
   som förslag. Fixa det inte i samma diff.
7. **Rör inte de serialiserade filerna ovan.**
8. **Är fyndet redan åtgärdat?** Skriv det i rapporten och stäng PR:en tom
   i stället för att hitta arbete. Ankarna här är verifierade mot `6354c91c4`,
   men master rör sig.

### Startprompt (klistra in, byt ut `<FIL>`)

```text
Du är Builder i Sajtmaskin. Utgå från origin/master.

Läs docs/plans/active/2026-08-20-vagschema/00-master-plan.md — den äger
körordningen och agentkontraktet. Läs sedan och utför
docs/plans/active/2026-08-20-vagschema/aktiviteter/<FIL>.md.

Läs också .cursor/rules/: workflow, git, pr-merge, agent-worktree,
response-format, subagent-models, mvp-scope-freeze.

Egen branch från origin/master. EN PR mot master, inte draft. Du mergar inte
och sätter inte merge:ready förrän du kört Bugbot-pass på din egen diff,
triagerat varje fynd och postat din sign-off-kommentar på PR:en. Startar du
subagenter: skicka alltid model enligt subagent-models.mdc.

Rör inte BUG-SWARM-BACKLOG.md, capability-map.json eller docs/generated/ om
inte din aktivitetsfil säger det. Bredda inte scope.
```

Cloud-poden har egna fällor (Postgres-cert, injicerad `REDIS_URL`, ingen Fly,
`OPENAI_API_KEY` utan kvot): [`cursor-cloud-agent.md`](../../../runbooks/cursor-cloud-agent.md).

## Bygg inte / rör inte

| Sak | Varför |
|---|---|
| D5 fri add/remove i Backoffice | Väntar ägarbeslut |
| Ta bort knappen «Bygg integrationer» | Beslut 2026-08-17 |
| Ta bort `SELECTED_SECTION_CHAR_CAP = 480` | Beslut 2026-08-19. Siffran är en öppen avvägning, taket är ett skydd |
| Slå på `SAJTMASKIN_LIVE_REVIEW` | `SM-070` är en grind: retention, idempotens och att befogenheten faktiskt gaterar — allt tre samtidigt |
| Slå på `SAJTMASKIN_DOMAIN_PURCHASE` | `SM-007` är en grind, inte tolv lösa buggar |
| Göra kritikern blockerande | Den är advisory med avsikt. Ingen ny repair-agent i det steget |
| Ema-PR (`EmaCodeHero`) mot master | Retargeta till `ema`. Bara ägaren mergar |
| Brancher med `BRA` i namnet | Ägarens frysta backup. Radera eller force-pusha aldrig |
| Rå `git worktree remove` | Junction följer `node_modules` och tömmer huvudcheckouten. Använd `npm run worktree:remove` |

## Ägarbeslut — fråga, implementera inte

| Beslut | Var |
|---|---|
| Heter lagret före kodgeneratorn **Briefing**? Glossaryn säger «Ägarbeslut 2026-08-19», men `docs/decisions/README.md` har ingen sådan rad och B2 säger «väntar N1». Ratificera eller backa — annars kan ingen agent få B2 | Briefing-planen + glossaryn |
| D5 fri add/remove; är 480 rätt siffra? | Backlog § Väntar på ägarbeslut |
| Briefing N2–N5 (B4/B5 kräver inget beslut, men är ny produktförmåga under MVP-biasen) | Briefing-planen |
| OpenClaw-tokenrotation: gammal 401, ny 200, Render = Vercel | Driftkvittens. Skriv aldrig tokenvärdet |
| `Co-authored-by` på agentcommits | Öppen fråga |
| `wip/chat-readiness-to-diagnostics` kan raderas (ersatt av #1058) | Ägaren raderar |

## När den här filen är inaktuell

När alla tre vågor är mergade och `#1052` är avgjord: väv en rad i
[`../../avklarat/README.md`](../../avklarat/README.md), flytta kvarvarande
svansar till [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) och
radera den här mappen. Lämna inte två «start här»-filer.
