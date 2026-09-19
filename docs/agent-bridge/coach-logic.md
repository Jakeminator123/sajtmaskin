# Coach-korrespondens

`coach` är Jakobs GPT-browseragent (GitHub-åtkomst till sajtmaskin).
Cursor är arbetaren (`BRYGG-01`). Inboxen är issue **#1468**.
De pratar inte i den här chatten.

Kör alltid skriptet i **aktuell checkout/worktree**. Bygg inget parallellt
protokoll.

```text
Cursor --post--> #1468 --ping--> coach läser inbox + repo/PR
coach --svar--> #1468            Cursor --wait/read--> utför --> post
```

Skript: [`scripts/agent_bridge.py`](../../scripts/agent_bridge.py).
Kommentarstext exekveras aldrig. `ping` anropar inte ChatGPT-API:t — det
skriver wake-raden så coach (med minneskortet) går till #1468.

| Verb | Gör |
|---|---|
| `identity` | visa låst `agent_id` / role |
| `read` | hämta `[COACH→AGENT:v1]` till `.agent-bridge/latest-response.md` |
| `post` | skriv `[AGENT→COACH:v1]` till inboxen |
| `wait` | polla inboxen 5–10 min (`--timeout 600`) |
| `ping` | väck coach att läsa inboxen (ingen extra GitHub-post) |

## Första `/brygga` i chatten

Fråga **en gång** vad rundan är, om inte texten efter kommandot redan säger
det. Läs oläst inbox innan du startar en ny tråd. Lås `BRYGG-01` först när
rundan är vald.

## Därefter: ping-pong

Fråga inte igen. Kör tills avbrott.

1. Oläst coachpost → `read`. Utför beställningen.
2. Landat jobb → `post` (svara med `--reply-to <coach request_id>`), sedan
   `ping`, sedan `wait --timeout 600 --interval 15`.
3. Läs `.agent-bridge/latest-response.md`. Utför. Posta tillbaka. Upprepa.

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
