# /brygga

Läs skillen **en gång**. Fråga bara **första** gången i chatten.

Kanon: [`.agents/skills/brygga-coach/SKILL.md`](../../.agents/skills/brygga-coach/SKILL.md)
Logik: [`docs/agent-bridge/coach-logic.md`](../../docs/agent-bridge/coach-logic.md)
Transport: `python scripts/agent_bridge.py` i aktuell checkout/worktree.

Därefter ping-pong med coach via #1468 tills STOP, Jakob avbryter, eller
något ser fel ut. `/bryggagent` är samma loop. `/bridge` är en enskild post.
