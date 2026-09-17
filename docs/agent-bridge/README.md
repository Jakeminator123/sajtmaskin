# Agent Bridge v1

Lokalt/repo-bundet mailbox mellan Cursor-agenter och ChatGPT-coachen.
Kontrollrum: GitHub issue **#1468**.

Körbar owner: [`scripts/agent_bridge.py`](../../scripts/agent_bridge.py).
Format: [`protocol.md`](protocol.md).

| Identitet | Role | Rollfil |
|---|---|---|
| `MERGE-01` | `merge` | [`roles/merge.md`](roles/merge.md) |
| `BUILD-01` | `builder` | [`roles/builder.md`](roles/builder.md) |
| `SCOUT-01` | `scout` | [`roles/scout.md`](roles/scout.md) |

Inte OpenClaw-bridge. Inte `/scout`, `/builder` eller `/steward`.

## A. Första installation

Gör detta **en gång** per maskin efter att denna PR är mergad till `preview`
(den här setup-PR:n mergar du inte själv utan separat uppdrag):

1. `gh` finns på PATH. I pwsh: `Get-Command gh`.
2. `gh auth status` — använd GitHub CLI-login. Inga tokens i repo eller config.
3. Hämta branchen: `git fetch origin preview; git switch preview; git pull origin preview`
4. Kopiera config:

```powershell
Copy-Item .agent-bridge/config.example.json .agent-bridge/config.local.json
```

5. Sätt `repository` till slugen från `gh repo view --json nameWithOwner --jq .nameWithOwner`
   (måste matcha `git remote get-url origin`). Lämna inte example-värdet `owner/repo`.
6. Sätt **exakt en** identitet per worktree/chatt (avsnitt B–D).
7. Starta en **ny** Cursor-chatt så `/bridge` syns i project commands
   (fil: [`.cursor/commands/bridge.md`](../../.cursor/commands/bridge.md)).

`python` nedan är samma kommando på Windows om `python` finns; annars `py -3`.

## B. Hur Jakob sätter MERGE-01

I **MERGE-01:s** worktree, redigera `.agent-bridge/config.local.json`:

```json
{
  "agent_id": "MERGE-01",
  "role": "merge",
  "repository": "owner/repo",
  "bridge_issue": 1468
}
```

Byt `owner/repo` mot origin-slugen från steg A. Verifiera: `python scripts/agent_bridge.py identity`

Läs [`roles/merge.md`](roles/merge.md). En BUILD-agent får inte stå som `merge`.

## C. Hur Jakob sätter BUILD-01

I **BUILD-01:s** worktree:

```json
{
  "agent_id": "BUILD-01",
  "role": "builder",
  "repository": "owner/repo",
  "bridge_issue": 1468
}
```

Byt `owner/repo` mot origin-slugen från steg A. `python scripts/agent_bridge.py identity`

Läs [`roles/builder.md`](roles/builder.md).

## D. Hur Jakob sätter SCOUT-01

I **SCOUT-01:s** worktree:

```json
{
  "agent_id": "SCOUT-01",
  "role": "scout",
  "repository": "owner/repo",
  "bridge_issue": 1468
}
```

Byt `owner/repo` mot origin-slugen från steg A. `python scripts/agent_bridge.py identity`

Läs [`roles/scout.md`](roles/scout.md).

En identitet per worktree. Agenten får inte byta filen.

## E. Hur `/bridge` körs

**Primärt:** skriv `/bridge` i Cursor-chatten. Det är ett riktigt project
command från [`.cursor/commands/bridge.md`](../../.cursor/commands/bridge.md)
(samma mekanism som `/logg` och `/kedja`).

Text efter kommandot är status/message/evidence/beslut. Agenten ska då:

```powershell
python scripts/agent_bridge.py identity
python scripts/agent_bridge.py post --status READY --message "..." --evidence "..." --requested-decision "..."
```

Status: `QUESTION` | `BLOCKED` | `READY` | `DONE` | `REPORT`.

Default postar till #1468. `--pr` lägger en extra kopia på current PR; #1468
förblir mailbox-owner och är det enda `read`/`wait` läser.
`--dry-run` skriver meddelandet till stdout utan att posta.

**Fallback** om slash-command inte syns i en gammal chatt: kör samma
`python scripts/agent_bridge.py ...` manuellt. Öppna ny chatt efter pull.

## F. När ChatGPT ännu inte svarat

`read` / `wait` avslutar med kod 3 och skriver **inte** över
`.agent-bridge/latest-response.md`.

Det betyder inte att coachen är notifierad. v1 pingar inte ChatGPT.

## G. Hur `read` / `wait` fungerar

```powershell
python scripts/agent_bridge.py read
python scripts/agent_bridge.py wait --timeout 300 --interval 10
```

Båda läser kommentarer på #1468, accepterar bara `[COACH→AGENT:v1]` från
betrodd GitHub-author, matchar `agent_id` och helst `request_id`, och skriver
`.agent-bridge/latest-response.md`.

De **exekverar inte** svaret. Agenten måste läsa filen och tänka själv.

`wait` pollar GitHub max 5 minuter. Det väntar bara på en kommentar som
redan skrivits.

## H. ChatGPT pingas inte autonomt

v1 är manuell:

`agent → GitHub #1468 → Jakob skriver "kolla bridge" i ChatGPT → ChatGPT
läser/svarar i #1468 → agenten kör read/wait`

Jakob skriver fortfarande **kolla bridge** i nuvarande version.
`wait` är inte en ping till ChatGPT.

## Avslutningsregel

```text
Agent: <agent_id>
Role: <role>
Task: <task>
Head: <sha>
Status: <READY|BLOCKED|DONE|QUESTION>
```

När Coach behövs: `Kör /bridge.`

## Tester

```powershell
python -m unittest discover -s scripts -p "test_agent_bridge.py"
```
