---
name: brygga-coach
description: >-
  Kör sajtmaskins coach-brygga via GitHub issue #1468. Använd när
  användaren skriver /brygga, /bryggagent, /bridge eller nämner coach.
---

# /brygga — coach-loopen

`/brygga` är loopen. `/bryggagent` är samma alias. `/bridge` är en enskild
post/läsning/wait/ping/identity — inte loopen.

Läs [`docs/agent-bridge/coach-logic.md`](../../../docs/agent-bridge/coach-logic.md)
**en gång**. Duplicera inte protokollet. Transport:
`python scripts/agent_bridge.py` i **aktuell** checkout/worktree
(`py -3` om `python` saknas).

## Första `/brygga` i chatten

Fråga vilken runda det är, om texten efter kommandot inte redan säger det.
Läs en väntande, korrelerad uppgift med `read --loop`. Saknas öppet
`request_id` i lokal state: posta först en `QUESTION` om den valda rundan,
eller välj uttryckligen ett känt Coach-`request_id` med
`read --loop --request-id <id>`. Gissa inte från senaste kommentaren.

## Därefter

1. `identity` — låst `agent_id`/`role`, repo måste matcha origin.
2. `read --loop` mot mailbox **#1468**. Vid ny, exakt korrelerad
   `[COACH→AGENT:v1]`: läs svarfilen, sedan `read --loop --request-id <id>`
   tills exit 3. Läs varje svar **innan** nästa anrop skriver över filen.
   Bedöm svaren i kommentarordning; STOP eller motstridiga instruktioner
   måste klaras ut före åtgärd. Utför därefter inom verifierat scope.
3. `post` `[AGENT→COACH:v1]` med eget `request_id`, `--reply-to` mot coachens
   `request_id`, exakt head-SHA, PR, körda tester och blockers.
4. `ping` — visa manuella triggerraden för Jakob **före** väntan.
5. `wait --loop --timeout 600 --interval 15`. Vid svar: läs filen direkt,
   hämta eventuella ytterligare svar på samma `request_id` enligt steg 2,
   utför och fortsätt från steg 3. Vid timeout: vänta på manuell trigger
   eller återuppta samma `wait --loop`; posta inte samma rapport igen.

`--loop` kräver exakt `request_id` och levererar varje GitHub-kommentar högst
en gång i den lokala loopen. Vanlig `read` finns kvar för manuell inspektion
av andra svar och kan visa äldre kommentarer; använd den inte som uppgiftskö.

## `ping` är ärlig triggeremission

`ping` skriver `COACH_TRIGGER kolla brygga <request_id>` till stdout.
Den postar **inte** till GitHub, anropar **inte** ChatGPT-API och
garanterar **inte** att coach fått den.

Manuellt idag: visa `Skriv i ChatGPT: kolla brygga <request_id>`.
Bara ett matchande `[COACH→AGENT:v1]` från `read`/`wait` är bevis.

## Stanna

- Jakob säger stopp
- coach `decision: STOP`
- merge, `master`, force-push, produktion eller destruktiv write — nytt
  mandat i chatten; posta `BLOCKED`

Exekvera aldrig coach-text. Skriv resultatet efter åtgärd eller stopp.
