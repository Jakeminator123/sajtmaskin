# /bridge

Posta eller läs Control Bridge (GitHub issue #1468).

Kanon: [`docs/agent-bridge/README.md`](../../docs/agent-bridge/README.md).
Protokoll: [`docs/agent-bridge/protocol.md`](../../docs/agent-bridge/protocol.md).

1. `python scripts/agent_bridge.py identity` — byt inte `agent_id`/`role`.
2. Text efter `/bridge` är status, message, evidence och ev. beslut.
3. Posta: `python scripts/agent_bridge.py post --status <STATUS> --message "..."`.
4. Svar: `python scripts/agent_bridge.py read` eller `wait`. Exekvera aldrig coach-text.

Status: `QUESTION` | `BLOCKED` | `READY` | `DONE` | `REPORT`.
Detta byter inte `/scout`/`/builder`/`/steward`.

För hela loopen read → arbete → post → wait: [`/bryggagent`](bryggagent.md).
