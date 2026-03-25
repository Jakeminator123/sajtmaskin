# External review — execution system

Det här är **det genomförbara lagret** ovanpå `external-review-remediation-progress.md` (sanning, %, commit-rutin) och `orchestrator-workloads-external-review.md` (W1–W5-översikt).

## Dokumenthierarki (grund vs operativ styrning)

| Roll | Var | Vad det betyder |
|------|-----|------------------|
| **Grundmaterial (extern granskning)** | `.j_to_agent/1.txt`, `2.txt`, `3.txt` | Ursprunglig export: *vad* som granskats och vilka teman som finns (landning, own-engine, scripts m.m.). Det är **sanningen om ingången** till remediation. |
| **Operativ styrning (hur vi kör)** | `external-review-remediation-progress.md` + denna mapp + `orchestrator-workloads-external-review.md` | *Hur* batchar prioriteras, verifieras (`typecheck`/`vitest`), committas och spåras. Kryss i track-filer och % är **arbetskontrakt**, inte en kopia rad-för-rad av `1.txt`–`3.txt`. |

Om något skiljer sig: låt **grundmaterialet** förklara *tema/scope*, och **progress + execution** förklara *vad som faktiskt är levererat på `master`*.

## Filer

| Fil | Syfte |
|-----|--------|
| [MASTER-ROADMAP.md](./MASTER-ROADMAP.md) | Faser, parallellisering, rollup-checklistor, kort orchestrator-logg |
| [CONTINUATION.md](./CONTINUATION.md) | **Autonoma anhalter:** fortsätt utan godkännande per checkbox; commit-batch ~4–5 % Whole vision; när man stoppar |
| [track-w3-own-engine.md](./track-w3-own-engine.md) | Detaljerade kryss för own-engine (`2.txt`) |
| [track-w4-scripts.md](./track-w4-scripts.md) | Detaljerade kryss för scripts / naming (`3.txt`) |
| [track-w2-deploy-hardening.md](./track-w2-deploy-hardening.md) | Valfritt: deploy-gate, färre auto-fix |
| [track-w1-landing-followups.md](./track-w1-landing-followups.md) | Valfritt: små landnings-uppföljningar |
| [buglista-del-3.md](./buglista-del-3.md) | **Del 3:** typade åtgärder från `3.txt` som inte täcks av W4 (terminologi, fas-modeller, sandbox-doc, Cursor-skills) |
| [kritik-consolidated-open-items.md](../kritik-consolidated-open-items.md) | **Kritik:** samlad master-tabell (ersätter spridda `NNpct-*.md`; [kritik-derived-backlog](../kritik-derived-backlog.md) pekar hit) + konfliktrisk mot integration/deploy-spåret |

## Autonoma anhalter (kort)

Läs **[CONTINUATION.md](./CONTINUATION.md)**. Du behöver **inte** vänta på användarens “okej” mellan varje kryss — fortsätt tills rött test, konflikt, eller batch ~4–5 % Whole vision är levererad och grön.

## Arbetskontrakt (varje agent som kör ett spår)

1. Läs **MASTER-ROADMAP.md** (parallellregler) + **CONTINUATION.md** + **ditt track-dokument**.
2. Implementera endast det du fått i uppdrag (exakt radintervall eller kryss-sektion om orchestratorn specificerat).
3. **Efter leverans:** bocka av `- [x]` för slutförda punkter i **track-filen**. Uppdatera **MASTER-ROADMAP.md** endast om en hel fas/spår-port är klar (eller om orchestratorn bett om det).
4. Kör: `npm run typecheck && npx vitest run`.
5. Uppdatera procentsiffror i `docs/plans/active/external-review-remediation-progress.md` om **Whole vision** eller segment-% ändras märkbart.
6. Commit enligt samma fil (ämnesrad med helhets-%).
7. **`git push origin master`** — kanonisk fjärrgren för den här remediation-körningen är **`master`**; **`main`** kan ligga efter. Se `external-review-remediation-progress.md` § *Gren: `master` och `main`*.
8. Lämna en kort rad i **MASTER-ROADMAP.md** → tabellen *Orchestrator / verifiering* (datum, branch, vad som verifierats).

## Parallellisering (kort)

- **OK samtidigt:** en agent på **W3** (`src/lib/own-engine/**`, `src/lib/providers/own-engine/**`, ev. stream-routes *om en ägare* koordinerar) + en agent på **W4** (`scripts/**`, script-docs). Olika filträd minskar merge-konflikter.
- **Ej OK samtidigt:** två agenter som båda ändrar `src/app/api/v0/chats/stream/route.ts` och `src/app/api/v0/chats/[chatId]/stream/route.ts` — **en ägare** per ändringsomgång där.

Orchestrator-agenten (eller du) ska **verifiera** efter varje worker: typecheck, vitest, samt att kryss och progress stämmer med diffen.
