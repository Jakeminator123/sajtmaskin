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
Oläst inbox → `read` först.

## Därefter

1. `identity` — låst `agent_id`/`role`, repo måste matcha origin.
2. `read` mot mailbox **#1468**. Finns oläst `[COACH→AGENT:v1]` → utför.
3. `post` `[AGENT→COACH:v1]` med eget `request_id`, `--reply-to` mot coachens
   `request_id`, exakt head-SHA, PR, körda tester och blockers.
4. `ping` — emit trigger (se nedan).
5. `wait --timeout 600 --interval 15`. Tillbaka till steg 2. Fråga inte igen.

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
