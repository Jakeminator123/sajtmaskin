## Agent 30 — MAX_CHAT_SYSTEM_CHARS scope

### Definition

Hård cap (manifest `promptOrchestration.hardCaps.maxChatSystemChars` + env) för **klientens** valfria `system`-fält på chat API (`chatSchemas`), inte för server-sammansatt own-engine systemprompt.

### Common misconception vs engine system prompt

Engine/core/dynamic prompt begränsas **inte** av denna konstant.

### Confidence (%)

**~95%** (grep begränsar till API-schema).

### Improvements

- JSDoc: "API `system` only — not codegen system prompt".

**Model:** composer-2-fast (subagent)
