# Överlämning 2026-08-19 — styrdokument

Status: Active (historik). **Nästa agent startar i
[`../2026-08-20-handoff/00-master-plan.md`](../2026-08-20-handoff/00-master-plan.md).**
Vågor 0–3 (#1053–#1068) är **mergade**. Följ inte Startprompten eller
tabellen «öppna draft-PR:er» nedan — de är nattens körorder, inte läget
nu. Enda levande aktiviteten här är
[`aktiviteter/live-review-blockers.md`](aktiviteter/live-review-blockers.md).
Startad: 2026-08-19 (kväll)
Bas: master `9a5905933` (nattens slut: `dbfcfe7e3`)

Tre parallella sessioner arbetade på samma repo under 19 augusti och lämnade
arbete i tre olika lägen: committat och mergat, committat men inte landat, och
ocommitterat i en worktree. Den här planen samlar det som inte var avslutat, så
det kan plockas upp utan att någon behöver rekonstruera tre chattar.

Planen äger **inte** buggsanningen. Defekter hör i
[`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md); fattade beslut i
[`docs/decisions/README.md`](../../../decisions/README.md). Den här filen äger
bara körordningen och vem som får röra vilka filer samtidigt.

## Vad som räddades

| Vad | Var det ligger nu | Skick |
|---|---|---|
| Builder-UI: Lanseringskortet → Versionsdiagnostik | Branch `origin/wip/chat-readiness-to-diagnostics` (`fac7d720a`) | **Ofullbordat.** Låg ocommitterat i sex timmar. Basen är `d96acd5c7`, 44 commits bakom master |
| Dossier-förenkling steg 2–5 | [`../2026-08-19-dossier-forenkling/`](../2026-08-19-dossier-forenkling/00-master-plan.md) | Komplett styrdokument, nu på master |
| Otriagerade svärmfynd (39 rader) | Triagerade in i [`BUG-SWARM-BACKLOG.md`](../../../../BUG-SWARM-BACKLOG.md) 2026-08-20 | **Klart.** Underlaget var gitignorerat och hade försvunnit med maskinen; det låg här tills passet var gjort och är nu raderat |
| Live-review steg 1 | PR [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) | **Blockerad trots gröna checks.** Se [`live-review-blockers.md`](aktiviteter/live-review-blockers.md). Flaggan ska vara av och `merge:ready` ska saknas |

## Vad som inte blev gjort

Ärlig lista. Ingen av raderna är en anklagelse — de är arbetet som föll mellan
sessionerna.

| Ogjort | Konsekvens om det förblir ogjort |
|---|---|
| **Skrivpasset i backloggen.** Bara fyra av 39 svärmfynd triagerades in i `Aktiv kö`. | `SM-058`–`SM-061` finns nu, men P2/P3-rader och flyttade ankare ligger kvar i underlaget. Nästa agent väljer annars arbete ur en ofullständig lista |
| **PR #1052 fick gröna checks men saknar en aktuell riskgranskning.** | Kostnad kan inte knytas till generationen, en lokal screenshot-fallback kan ge falskt pass och publika Blob-bilder saknar ägarskap/retention. Den ska inte få `merge:ready` ännu |
| **`docs/plans/active/README.md` sa «ingen aktiv plan»** samtidigt som planmappen skrevs bredvid. | Routern motsade sig själv. Åtgärdat i samma ändring som den här filen |
| **WIP-branchen rebasades aldrig.** | 44 commits drift mot master, i filer (`ChatInterface.tsx`, `BuilderHeader.tsx`) som ändrades kraftigt samma dag |
| **Tre worktrees och elva lokala brancher städades aldrig.** | Nio brancher har `gone` upstream. Risk att någon tror att arbete förlorats |
| **Fyndens ankare omverifierades aldrig mot dagens master.** | Fyra fynd lagades av dagens PR:er. En agent som får listan rå fixar sådant som redan är fixat |

## Redan lagat idag — skicka ingen agent på det här

Kontrollerat mot mergade PR:er 19 augusti. Fynden lever kvar i underlaget men
är stängda:

| Fynd | Stängt av |
|---|---|
| P0-V1 mörk variant blev ljus sajt | [#1049](https://github.com/Jakeminator123/sajtmaskin/pull/1049) |
| P0-G2 next-themes script-varning som defekt | [#1050](https://github.com/Jakeminator123/sajtmaskin/pull/1050) |
| P1-PR1 Deep Brief-rader på uppföljningar | [#1048](https://github.com/Jakeminator123/sajtmaskin/pull/1048) |
| P3-UI5 Prompt-assist saknas i master | [#1038](https://github.com/Jakeminator123/sajtmaskin/pull/1038) |
| Dossier-data i kopplade (steg 1) | [#1045](https://github.com/Jakeminator123/sajtmaskin/pull/1045) |
| SM-057 migrationsledgern | [#1046](https://github.com/Jakeminator123/sajtmaskin/pull/1046) |

Två saker är **beslutade och får inte «förbättras»**: knappen «Bygg
integrationer» stannar (2026-08-17) och `SELECTED_SECTION_CHAR_CAP = 480` är ett
skydd mot att «Avoid» svälts, inte en defekt (2026-08-19).

## Stabiliseringsvåg 0 — mergad (#1053–#1057)

Historik. Öppna inte, granska inte och merga inte de här PR:erna igen.
#1052 är fortfarande blockerad — se
[`aktiviteter/live-review-blockers.md`](aktiviteter/live-review-blockers.md).

| PR | Vad som landade |
|---|---|
| [#1057](https://github.com/Jakeminator123/sajtmaskin/pull/1057) | Capability-map-fingeravtryck efter schemaändringen i `9a5905933` |
| [#1055](https://github.com/Jakeminator123/sajtmaskin/pull/1055) | AI SDK: warm-cache skild från installerad användarsajt |
| [#1054](https://github.com/Jakeminator123/sajtmaskin/pull/1054) | `toneAndVoice` + embedding-väg test |
| [#1053](https://github.com/Jakeminator123/sajtmaskin/pull/1053) | Prompt-assist outputtak |
| [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) | Live-review steg 1 — **fortfarande blockerad** |

## Hur arbetet körs

Körordningen för våg 0–3 är **avklarad**. Ny körordning ägs av
[`../2026-08-20-handoff/00-master-plan.md`](../2026-08-20-handoff/00-master-plan.md).
Tabellen nedan är nattens arbetsmodell, inte en startorder.

| Spår | Vad | Var | Samtidighet |
|---|---|---|---|
| **S — Stabilisering** | Våg 0 landad. Kvar: #1052-hardening | GitHub + lokalt | Bara #1052 |
| **D — Dossier** | D2 → D3 → D4 | Cloud | **Strikt sekventiellt.** En agent i taget |
| **B — Buggar** | Våg 1–3 landade. Nästa rad ur backlog | Cloud + lokalt | En rad per PR |
| **H — Housekeeping** | Backlog, docs, scheman, städ | **Lokalt** | Inte samtidigt som en kodvåg |

Spår D äger sin egen ordning i
[`../2026-08-19-dossier-forenkling/00-master-plan.md`](../2026-08-19-dossier-forenkling/00-master-plan.md).
Upprepa den inte här.

### Varför inte allt parallellt

Fyra filer skrivs av nästan varje ändring och gör parallella agenter till
konfliktarbete i stället för utveckling:

- `data/dossiers/_index/capability-map.json`
- `docs/generated/*.md`
- `BUG-SWARM-BACKLOG.md`
- `docs/decisions/README.md` och `docs/plans/active/README.md`

Att git mergar dem rent på textnivå betyder inte att resultatet är riktigt —
två ändringar kan sitta snällt intill varandra och ändå motverka varandra. Därför
äger **spår H ensamt** alla fyra, och kör bara när ingen våg är igång.

### Vågor i spår B

Ingen fil förekommer hos två agenter i samma våg. Det är hela villkoret för att
våg-medlemmarna får gå parallellt.

| Våg | Paket | Ägda filer | Var | Läge |
|---|---|---|---|---|
| 1 | [Init-promptens logg saknar `chat_id`](aktiviteter/initprompt-utan-chatid.md) | `src/lib/api/engine/chats/create-chat-stream-post.ts` | Cloud | **Klar** — #1059 |
| 1 | [Lanseringskortet → Versionsdiagnostik](aktiviteter/lanseringskort-till-diagnostik.md) | `src/app/builder/`, `src/components/builder/`, `src/lib/builder/` | Cloud | **Klar** — #1058 |
| 1 | [Källkvittot ljuger nedåt](aktiviteter/kallkvitto-reachedprompt.md) | `src/lib/gen/orchestrate/source-receipt.ts` | Cloud | **Klar** — #1060 |
| 1 | [Kostnadsrapporten ljuger](aktiviteter/kostnadsrapport-huvudtotal.md) | `scripts/db/generation-cost.mjs`, `backoffice/pages/generation_cost.py` | **Lokalt** | **Klar** — #1062 |
| 2 | [Postcheck blockerar före runtime är redo](aktiviteter/postcheck-boot-page.md) | `src/lib/gen/verify/product-postcheck.ts`, `src/lib/capture/` | Cloud | **Klar** — #1061 |
| 2 | [Scaffold-matchningen väljer fel sajttyp](aktiviteter/scaffold-tone-vs-typ.md) | `src/lib/gen/scaffolds/`, `orchestrate/` | Cloud | **Klar** — #1054 |
| 2 | [Fly: `npm install` exit 254](aktiviteter/preview-host-npm-254.md) | `preview-host/` | **Lokalt** | **Klar** — #1063 |
| 3 | [SM-017: grinden stämplas grön för tidigt](aktiviteter/SM-017-grind-stamplad-for-tidigt.md) | `finalize-version/persist-telemetry.ts`, `services/generation-telemetry.ts` | Cloud | **Klar** — #1068 |
| 3 | [`fake_form` i designläge](aktiviteter/fake-form-i-designlage.md) | `product-postcheck.ts`, `chat-readiness.ts` | Cloud | **Klar** — #1067 |
| 3 | [`new Date()` i genererad footer](aktiviteter/footer-new-date-hydration.md) | `src/lib/gen/autofix/rules/` | Cloud | **Klar** — #1065 |
| 3 | [SM-034: `stillMissing` stoppar inte save](aktiviteter/SM-034-stillmissing-stoppar-inte.md) | `scaffolds/protected-paths.ts`, repair-vägen | Cloud | **Klar** — #1066 |
| — | `SM-062`: Next 16.3 döpte om HMR-sökvägen | `preview-proxy.js`, `product-postcheck.ts` | Lokalt | **Klar** — #1064. Bevakningsluckan kvar |

**Våg 3 är mergad.** Kvar från den här planen: #1052-blockers, SM-062:s CI-lucka
(residual, inte egen kö-rad) och OpenClaw-kvittensen. Dossier D2–D4 ägs av
sin egen plan.

### Vad som inte hör hemma i cloud

Cloud-podar har konkreta begränsningar
([`cursor-cloud-agent.md`](../../../runbooks/cursor-cloud-agent.md)):

| Begränsning | Vad det utesluter |
|---|---|
| Postgres saknas eller har självsignerat cert | Allt som ska bevisas mot riktig data — kostnadsrapporten, telemetri-frågor |
| Python saknar ofta `pip` | `npm run backoffice:test`, `npm run lint:py` |
| Ingen Fly-åtkomst | Rotorsak till `npm install` exit 254 |
| `OPENAI_API_KEY` har noll kvot | Generation E2E, om inte Anthropic-profilen väljs explicit |
| Injicerad `REDIS_URL` | `npm run test:ci` — kör `env -u REDIS_URL npm run test:ci` |

Fyra testfall failar i pod på grund av injicerade secrets. De är inte
regressioner — listan står i runbooken.

### Startprompt (historik — använd inte)

Nattens mall. Ny startprompt ligger i
[`../2026-08-20-handoff/00-master-plan.md`](../2026-08-20-handoff/00-master-plan.md).
Behållen bara så man ser vad cloud-agenterna fick:

```text
Du är Builder i Sajtmaskin. Utgå från origin/master.

Läs och utför docs/plans/active/2026-08-19-overlamning/aktiviteter/<FIL>.md.
Läs också .cursor/rules/ — särskilt workflow.mdc, git.mdc, pr-merge.mdc,
agent-worktree.mdc, response-format.mdc och subagent-models.mdc.

Egen branch: fix/<kort>. En PR mot master. Du mergar inte och sätter inte
merge:ready förrän du triagerat varje bot-fynd och postat sign-off-raden.
Kör ett bugbot-pass på din egen diff före PR, och om vid varje ny commit.
Startar du subagenter: skicka alltid model enligt subagent-models.mdc.

Ankarna i filen är inte omverifierade mot dagens master. Bekräfta varje fynd
med egen läsning innan du ändrar något. Är det redan åtgärdat — skriv det i
rapporten och gå vidare. Bredda inte scope.
```

Kör lokalt i stället för cloud: samma text, men med worktree enligt
`agent-worktree.mdc` (`git worktree add ..\sajtmaskin-<säte>-<kort> -b fix/<kort> origin/master`).

### Annat gitignorerat material som inte är säkrat

`.cursor/swarms/SPEC-2026-08-19-live-review.md` är en **ägargodkänd design** som
bara finns lokalt. PR #1052 är steg 1 av den; resterande steg finns ingen
annanstans. Den är inte kopierad hit eftersom spåret är levande — men den
försvinner med maskinen. Bestäm om den ska in i repot när #1052 är avgjord.

## Grindar

1. **Ingen agent mergar.** Merge ägs av ett säte enligt
   [`pr-merge.mdc`](../../../../.cursor/rules/pr-merge.mdc).
2. **Bugbot-pass på egen diff före varje PR**, och om vid varje ny commit.
3. **`merge:ready` sätts först efter triagerad bot-granskning** — sign-off före
   label, aldrig tvärtom.
4. **Cloud-agenter startar från `origin/master`**, aldrig från en lokal branch.
5. **En våg i taget.** Nästa våg startar när föregående är mergad, inte när den
   är öppnad.
6. **Driftkvittens efter tokenrotation:** gammal OpenClaw-token ska ge 401, ny
   token 200 och samma nya secret ska ligga i Render och Vercel. Skriv aldrig
   själva tokenvärdet i plan, logg eller PR.

## Checklista

- [x] Stabiliseringsvåg 0 mergad: #1057, #1055, #1054, #1053, #1056
- [x] Våg 1 mergad: #1058, #1059, #1060 (kostnadsrapporten i #1062)
- [x] Våg 2 kodpaket mergade: #1061 och #1054
- [x] Våg 3 aktivitetsfiler skrivna mot master `f668512a1`
- [x] Våg 3 mergad: #1065, #1066, #1067, #1068
- [x] Fly `SM-035` klar (#1063). Disken utesluten som orsak — 29 % använt 2026-08-20
- [x] `SM-062` symptomen fixade (#1064). **Kvar:** kontraktet kan aldrig fånga en Next-drift i CI eftersom `preview-host` saknar Next som beroende — behöver en smal CI-lane
- [x] Spår H: skrivpasset klart och underlaget raderat
- [ ] Spår D klart enligt sin egen plan
- [ ] PR #1052:s blockers åtgärdade och omgranskade; först därefter beslut om `merge:ready`
- [ ] OpenClaw-rotation kvitterad: gammal 401, ny 200, Render/Vercel synkade
- [ ] Ägarbeslut: D5 fri add/remove, 480-siffran, `Co-authored-by` på agentcommits
- [x] `wip/chat-readiness-to-diagnostics` ersatt av #1058 — branchen kan raderas
- [ ] Den här planen vävs in i [`../../avklarat/README.md`](../../avklarat/README.md) och mappen raderas
