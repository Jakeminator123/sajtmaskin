# Agent Bridge v1

Lokalt/repo-bundet mailbox mellan Cursor-agenter och ChatGPT-coachen.
Kontrollrum: GitHub issue **#1468**.

Körbar owner: [`scripts/agent_bridge.py`](../../scripts/agent_bridge.py).
Format: [`protocol.md`](protocol.md).

| Identitet | Role | Rollfil | Läge |
|---|---|---|---|
| `BRYGG-01` | `brygg` | [`roles/brygg.md`](roles/brygg.md) | **aktiverad i v1** |
| `MERGE-01` | `merge` | [`roles/merge.md`](roles/merge.md) | parkerad |
| `BUILD-01` | `builder` | [`roles/builder.md`](roles/builder.md) | parkerad |
| `SCOUT-01` | `scout` | [`roles/scout.md`](roles/scout.md) | parkerad |

v1 aktiverar **en** roll. Fyra identiteter är fler rörliga delar än vi kan
felsöka innan loopen gått runt en gång, så de tre specialiserade rollerna är
definierade men parkerade tills en bryggagent kört en full runda
post → coach → read. Byt inte identitet för att kringgå en gräns.

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
6. Sätt **exakt en** identitet per worktree/chatt. I v1 är det `BRYGG-01`
   (avsnitt B). Avsnitt C–E beskriver de parkerade rollerna.
7. Starta en **ny** Cursor-chatt så `/bryggagent` och `/bridge` syns i project
   commands (filer: [`.cursor/commands/bryggagent.md`](../../.cursor/commands/bryggagent.md),
   [`.cursor/commands/bridge.md`](../../.cursor/commands/bridge.md)).

`python` nedan är samma kommando på Windows om `python` finns; annars `py -3`.

## B. Hur Jakob sätter BRYGG-01 (v1:s enda aktiva roll)

I bryggagentens worktree, redigera `.agent-bridge/config.local.json`:

```json
{
  "agent_id": "BRYGG-01",
  "role": "brygg",
  "repository": "owner/repo",
  "bridge_issue": 1468
}
```

Byt `owner/repo` mot origin-slugen från steg A. Verifiera: `python scripts/agent_bridge.py identity`

Läs [`roles/brygg.md`](roles/brygg.md). Kör sedan `/bryggagent` i chatten.

## C. Hur Jakob sätter MERGE-01 (parkerad)

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

## D. Hur Jakob sätter BUILD-01 (parkerad)

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

## E. Hur Jakob sätter SCOUT-01 (parkerad)

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

## F. Hur `/bryggagent` och `/bridge` körs

**Primärt i v1:** skriv `/bryggagent` i Cursor-chatten. Det låser rollen och
kör loopen read → arbete → post → wait
([`.cursor/commands/bryggagent.md`](../../.cursor/commands/bryggagent.md)).

`/bridge` är låg-nivåtransporten och finns kvar för en enskild post eller
läsning. Båda är riktiga project commands från
[`.cursor/commands/bridge.md`](../../.cursor/commands/bridge.md)
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

## G. När ChatGPT ännu inte svarat

`read` / `wait` avslutar med kod 3 och skriver **inte** över
`.agent-bridge/latest-response.md`.

Det betyder inte att coachen är notifierad. v1 pingar inte ChatGPT.

## H. Hur `read` / `wait` fungerar

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

## I. ChatGPT pingas inte autonomt

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

När Coach behövs: `Kör /bryggagent.`

## Tester

```powershell
python -m unittest discover -s scripts -p "test_agent_bridge.py"
```
