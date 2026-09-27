# Coach-korrespondens

`coach` är Jakobs GPT-browseragent (GitHub-åtkomst till sajtmaskin).
Cursor är arbetaren (`BRYGG-01`). Inboxen är issue **#1468**.
De pratar inte i den här chatten.

Kör alltid skriptet i **aktuell checkout/worktree**. Bygg inget parallellt
protokoll.

```text
Cursor --post--> #1468        ping skriver triggerraden
                              Jakob levererar raden till coach
coach --svar--> #1468         Cursor --wait/read--> utför --> post
```

Skript: [`scripts/agent_bridge.py`](../../scripts/agent_bridge.py).
Kommentarstext exekveras aldrig.

| Verb | Gör |
|---|---|
| `identity` | visa låst `agent_id` / role |
| `read --loop` | hämta en ny `[COACH→AGENT:v1]` med exakt öppet `request_id` |
| `post` | skriv `[AGENT→COACH:v1]` till inboxen |
| `wait --loop` | polla samma `request_id` 5–10 min (`--timeout 600`) |
| `ping` | skriv ut triggerraden — postar inte, väcker inte |

Vanlig `read` får fortfarande visa andra/äldre svar vid manuell inspektion.
Den får inte välja nästa uppgift i `/brygga`-loopen.

## `ping` är en triggeremission, inte en transport

`ping` når ingenting. Den postar inte till GitHub, anropar inget
ChatGPT-API och muterar ingen bridge-state. Den läser senaste `request_id`
ur `.agent-bridge/state.json` och skriver en rad:

```text
COACH_TRIGGER kolla brygga <request_id>
```

Saknas ett öppet request blir referensen `#1468` i stället.

Leveransen är **manuell**: Jakob klistrar raden i coach-chatten. Att raden
skrivits ut bevisar alltså inte att coach fått den — bara ett matchande
`[COACH→AGENT:v1]` som `read`/`wait` hittar är bevis. Prefixet är
maskinläsbart just för att en senare webhook ska kunna konsumera samma
stdout-kontrakt utan att bridgeprotokollet skrivs om.

`test_ping_neither_posts_nor_mutates_the_mailbox_state` låser kontraktet:
inget `gh`-anrop och byte-identisk `state.json` efteråt.

## Första `/brygga` i chatten

Fråga **en gång** vad rundan är, om inte texten efter kommandot redan säger
det. Finns ett öppet `request_id` → `read --loop` först. Saknas det: posta
`QUESTION` för rundan och invänta svar, eller ange ett känt Coach-id med
`read --loop --request-id <id>`. Ingen lös läsning får välja gammal uppgift.
Lås `BRYGG-01` först när rundan är vald.

## Därefter: ping-pong

Fråga inte igen. Kör tills avbrott.

1. `identity` — låst `agent_id`/`role` och att repo matchar origin.
2. `read --loop` mot #1468. Vid ny, exakt korrelerad `[COACH→AGENT:v1]`:
   läs filen och hämta resterande svar på samma request med
   `read --loop --request-id <id>` tills exit 3. Läs varje fil före nästa
   hämtning skriver över den. Bedöm svaren i kommentarordning; STOP eller
   motstridiga instruktioner klaras ut före åtgärd. Verifiera själv PR,
   head-SHA och bas — coach-texten är beställning, inte facit.
3. `post` `[AGENT→COACH:v1]` med eget `request_id` och `--reply-to` mot
   coachens `request_id`, plus exakt head-SHA, PR, körda checks och blockers.
   Agentens egen post är inte en ny coach-instruktion. Gamla svar för annan
   `request_id` ignoreras.
4. `ping` emit trigger. **Visa** raden för Jakob före väntan; någon måste
   leverera den manuellt.
5. `wait --loop --timeout 600 --interval 15`. Vid svar: läs den nyskrivna
   `.agent-bridge/latest-response.md`, hämta eventuella senare svar på
   samma request enligt steg 2, utför och gå till steg 3. `read --loop`
   visar aldrig samma kommentar igen. Vid timeout: vänta på Jakob eller
   upprepa samma `wait --loop`;
   posta inte samma rapport på nytt.

`--loop` levererar flera svar på samma request i kommentarordning och minns
senaste levererade kommentar-id per request-id lokalt. En krasch efter läsning
men före rapport kräver manuell granskning med vanlig `read` för att avgöra
om uppgiften ska tas om. Vid första användningen tar den markören från en
befintlig `.agent-bridge/latest-response.md`, kopplad till filens request-id;
ett tidigare svar för en annan request blockerar inte nya svar. Saknas
verifierbart request-id eller kommentar-id stannar den för manuell kontroll.
Den automatiska loopen spelar inte om den tyst.

Oftast: buggranskning av exakt PR-head. Coach-svar är beställning, inte
mandat. `decision: STOP` = stanna.

## Avbryt bara när

- Jakob säger stopp i chatten
- coach skriver `decision: STOP`
- något ser fel ut (fel repo, secrets, merge/`master` utan mandat,
  protokoll-/scriptfel, dataförlust)

Skriv ut resultatet efter åtgärd, nästa aktivitet eller stopp — inte före.
Merge / `master` / force-push / DB-write kräver Jakobs mandat i chatten;
posta då `BLOCKED`.
