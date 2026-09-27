# /brygga

Normala coach-loopen. Läs skillen **en gång**. Fråga bara **första**
gången i chatten.

Kanon: [`.agents/skills/brygga-coach/SKILL.md`](../../.agents/skills/brygga-coach/SKILL.md)
Logik: [`docs/agent-bridge/coach-logic.md`](../../docs/agent-bridge/coach-logic.md)
Transport: `python scripts/agent_bridge.py` i aktuell checkout (`py -3` fallback).
I loopen: `read --loop` och `wait --loop --timeout 600 --interval 15`.
Vanlig `read` är bara för manuell inspektion.

`/bryggagent` är samma loop. `/bridge` är en enskild op.
