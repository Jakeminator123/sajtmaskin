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
6. Sätt **exakt** `BRYGG-01` / `brygg` i config (avsnitt B). Avsnitt C–E
   dokumenterar parkerade framtida identiteter; parsern nekar dem i v1.
7. Starta en **ny** Cursor-chatt så `/brygga`, `/bryggagent` och `/bridge` syns
   (filer: [`.cursor/commands/brygga.md`](../../.cursor/commands/brygga.md),
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

Läs [`roles/brygg.md`](roles/brygg.md) och [`coach-logic.md`](coach-logic.md).
Kör sedan `/brygga` i chatten. Första gången i chatten frågar agenten
vilken runda det är; därefter ping-pong utan ny fråga.

## C–E. Parkerade identiteter (inte aktiverbara i v1)

`MERGE-01` / `merge`, `BUILD-01` / `builder` och `SCOUT-01` / `scout` är
definierade i `ALLOWED_IDENTITIES` och har rollfiler
([`roles/merge.md`](roles/merge.md), [`roles/builder.md`](roles/builder.md),
[`roles/scout.md`](roles/scout.md)). De är **inte** en giltig lokal config i
v1. `parse_config_text()` och `identity` nekar dem, även om rollparet stämmer.

Sätt dem inte i `.agent-bridge/config.local.json`. En framtida
aktiveringsmekanism krävs innan de får startas. Byt inte identitet för att
kringgå en gräns. En identitet per worktree. Agenten får inte byta filen.

## F. Hur `/brygga` och `/bridge` körs

**Primärt:** `/brygga` (alias `/bryggagent`). Fråga bara första gången i
chatten. Loop: [`.cursor/commands/brygga.md`](../../.cursor/commands/brygga.md),
[`coach-logic.md`](coach-logic.md).

`/bridge` är låg-nivåtransporten för en enskild post eller läsning
([`.cursor/commands/bridge.md`](../../.cursor/commands/bridge.md)).

```powershell
python scripts/agent_bridge.py identity
python scripts/agent_bridge.py read
python scripts/agent_bridge.py post --status READY --message "..." --evidence "..."
python scripts/agent_bridge.py ping
python scripts/agent_bridge.py wait --timeout 600 --interval 15
```

Oläst inbox → `read` först. Landat jobb → `post`, `ping`, `wait` 5–10 min,
utför, posta tillbaka. Avbryt bara vid STOP, Jakobs stopp eller fel.

Status: `QUESTION` | `BLOCKED` | `READY` | `DONE` | `REPORT`.

Default postar till #1468. `--pr` lägger en extra kopia på current PR; #1468
förblir mailbox-owner. `--dry-run` skriver till stdout utan att posta.

## G. När ChatGPT ännu inte svarat

`read` / `wait` avslutar med kod 3 och skriver **inte** över
`.agent-bridge/latest-response.md`. Kör `ping` efter `post` — `wait`
levererar ingen trigger.

## H. Hur `read` / `wait` / `ping` fungerar

`read` och `wait` läser #1468, accepterar bara `[COACH→AGENT:v1]` från
betrodd GitHub-author, och skriver `.agent-bridge/latest-response.md`.
De exekverar inte svaret. `wait` pollar GitHub max 10 minuter
(`--timeout 600`).

## I. Triggern mot coach

```text
Cursor postar → ping skriver triggerraden → Jakob levererar den
→ coach läser #1468 → svarar → wait/read
```

`ping` postar inte, anropar inget ChatGPT-API och muterar ingen state. Den
skriver `COACH_TRIGGER kolla brygga <request_id>` (eller `#1468` när inget
request är öppet) och inget mer. **Utskriven rad är inte samma sak som
levererad trigger** — bara ett matchande coach-svar är bevis. Detaljer och
testreferens: [`coach-logic.md`](coach-logic.md).

## Avslutningsregel

```text
Agent: <agent_id>
Role: <role>
Task: <task>
Head: <sha>
Status: <READY|BLOCKED|DONE|QUESTION>
```

När Coach behövs: `Kör /brygga.`

## Tester

```powershell
npm run test:agent-bridge
```

Samma svit körs i required `quality-contracts` (aggregatet `quality`).
