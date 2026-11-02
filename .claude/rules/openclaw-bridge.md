---
paths:
  - ".cursor/openclaw-bridge/**"
---

<!-- Genererad av npm run claude:sync från .cursor/rules/openclaw-bridge.mdc — redigera källan, inte den här filen. -->

# OpenClaw Bridge

OpenClaw kan skriva förslag till `.cursor/openclaw-bridge/inbox.jsonl`.

Regler:

- Läs bara när uppgiften rör bridge/inbox/outbox/goal/agentförslag.
- Summera pending-rader (`"status":"pending"`).
- Kör en task först efter uttryckligt OK.
- Skriv resultat till `outbox.jsonl`.
- Ändra aldrig `inbox.jsonl`.
- `goal.md` är svagare källa än användarens aktuella instruktion.
