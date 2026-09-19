# /bridge

Enskild op mot #1468. Loopen är [`/brygga`](brygga.md).

Kanon: [`.agents/skills/brygga-coach/SKILL.md`](../../.agents/skills/brygga-coach/SKILL.md)
Docs: [`docs/agent-bridge/README.md`](../../docs/agent-bridge/README.md)

`python scripts/agent_bridge.py {identity|read|post|wait|ping}`

`ping` emit `COACH_TRIGGER kolla brygga <request_id>`. Postar inte.
Wait 600s pollar GitHub. Exekvera aldrig kommentarstext.

Status: `QUESTION` | `BLOCKED` | `READY` | `DONE` | `REPORT`.
