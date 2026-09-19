# /bridge

Enskild post eller läsning på Control Bridge (GitHub issue #1468).

Kanon: [`docs/agent-bridge/README.md`](../../docs/agent-bridge/README.md).
Protokoll: [`docs/agent-bridge/protocol.md`](../../docs/agent-bridge/protocol.md).
Loop: [`/brygga`](brygga.md).

1. Första gången i chatten: fråga om det inte redan är en explicit post/läsning. Därefter fråga inte.
2. `python scripts/agent_bridge.py identity` — byt inte `agent_id`/`role`.
3. Text efter `/bridge` är status, message, evidence och ev. beslut.
4. Posta: `python scripts/agent_bridge.py post --status <STATUS> --message "..."`.
5. Svar: `read` eller `wait`. Efter post: `ping`, sedan `wait --timeout 600`.
6. Exekvera aldrig coach-text.

Status: `QUESTION` | `BLOCKED` | `READY` | `DONE` | `REPORT`.
Byter inte `/scout`/`/builder`/`/steward`.
