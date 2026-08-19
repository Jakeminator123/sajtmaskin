# Överlämning 2026-08-19 — styrdokument

Status: Active
Startad: 2026-08-19 (kväll)
Bas: master `7f9dd1786`

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
| Otriagerade svärmfynd (39 rader) | [`underlag/2026-08-19-svarmfynd.md`](underlag/2026-08-19-svarmfynd.md) | Rådata. Var gitignorerad och hade försvunnit med maskinen |
| Live-review steg 1 | PR [#1052](https://github.com/Jakeminator123/sajtmaskin/pull/1052) | Öppen, alla checks gröna, saknar `merge:ready` |

## Vad som inte blev gjort

Ärlig lista. Ingen av raderna är en anklagelse — de är arbetet som föll mellan
sessionerna.

| Ogjort | Konsekvens om det förblir ogjort |
|---|---|
| **Skrivpasset i backloggen.** 39 svärmfynd triagerades aldrig in i `Aktiv kö`. | Kön säger 28 öppna rader medan minst fyra bekräftade defekter saknas helt. Nästa agent väljer arbete ur en ofullständig lista |
| **PR #1052 signerades men fick aldrig `merge:ready`.** | Grön PR står stilla. `review-window` är redan passerad |
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

## Hur arbetet körs

Tre spår. Spår D och B kan gå samtidigt; spår H går mellan vågorna.

| Spår | Vad | Var | Samtidighet |
|---|---|---|---|
| **D — Dossier** | D2 → D3 → D4 | Cloud | **Strikt sekventiellt.** En agent i taget |
| **B — Buggar** | Bekräftade defekter i vågor | Cloud + lokalt | Parallellt **inom** en våg, sekventiellt **mellan** vågor |
| **H — Housekeeping** | Backlog, docs, scheman, städ | **Lokalt** | Mellan vågorna, aldrig samtidigt som en våg |

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

| Våg | Paket | Ägda filer | Var |
|---|---|---|---|
| 1 | [Init-promptens logg saknar `chat_id`](aktiviteter/initprompt-utan-chatid.md) | `src/lib/api/engine/chats/create-chat-stream-post.ts` | Cloud |
| 1 | [Lanseringskortet → Versionsdiagnostik](aktiviteter/lanseringskort-till-diagnostik.md) | `src/app/builder/`, `src/components/builder/`, `src/lib/builder/` | Cloud |
| 1 | [Källkvittot ljuger nedåt](aktiviteter/kallkvitto-reachedprompt.md) | `src/lib/gen/orchestrate/source-receipt.ts` | Cloud |
| 1 | [Kostnadsrapporten ljuger](aktiviteter/kostnadsrapport-huvudtotal.md) | `scripts/db/generation-cost.mjs`, `backoffice/pages/generation_cost.py` | **Lokalt** |
| 2 | [Postcheck blockerar före runtime är redo](aktiviteter/postcheck-boot-page.md) | `src/lib/gen/verify/product-postcheck.ts`, `src/lib/capture/` | Cloud |
| 2 | [Scaffold-matchningen väljer fel sajttyp](aktiviteter/scaffold-tone-vs-typ.md) | `src/lib/gen/scaffolds/`, `src/lib/gen/orchestrate/scaffold-query-context.test.ts` | Cloud |
| 2 | [Fly: `npm install` exit 254](aktiviteter/preview-host-npm-254.md) | `preview-host/` | **Lokalt** |
| 3 | SM-017: grinden stämplas grön före postcheck | `src/lib/gen/stream/finalize-version/persist-telemetry.ts` | Cloud |
| 3 | `fake_form` är systematiskt i designläge | `product-postcheck.ts` + F2-kontraktet | Cloud |
| 3 | `new Date()` i genererad footer | `src/lib/gen/autofix/rules/` | Cloud |
| 3 | SM-034: `stillMissing` stoppar inte save | `src/lib/gen/scaffolds/protected-paths.ts`, repair-vägen | Cloud |

**Våg 3 väntar på våg 2** av två skäl som inte syns i filistan: SM-017 läser
postcheckens utfall, och `fake_form` skriver i samma fil som boot-page-paketet.
Aktivitetsfiler för våg 3 skrivs när våg 2 är mergad — inte nu, eftersom
radankare driftar.

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

### Startprompt

Aktivitetsfilerna ligger i repot, så prompten behöver inte upprepa dem. Byt bara
sökvägen och det korta branchnamnet:

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

## Checklista

- [ ] PR #1052 triagerad och `merge:ready` satt (eller uttryckligt nej)
- [ ] Våg 1 mergad
- [ ] Spår H omgång 1 (se [`housekeeping.md`](aktiviteter/housekeeping.md))
- [ ] Våg 2 mergad
- [ ] Spår H omgång 2, inklusive att underlaget raderas när skrivpasset är gjort
- [ ] Våg 3 aktivitetsfiler skrivna mot då-aktuell master, sedan mergade
- [ ] Spår D klart enligt sin egen plan
- [ ] `wip/chat-readiness-to-diagnostics` antingen landad eller medvetet skrotad
- [ ] Den här planen vävs in i [`../../avklarat/README.md`](../../avklarat/README.md) och mappen raderas
