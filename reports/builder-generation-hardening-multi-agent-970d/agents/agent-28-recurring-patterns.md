## Agent 28 — Recurring patterns in repair

### Mechanism

`readRecurringPatternsForChat` läser `logs/site-observability/<chatId>/latest/fix-patterns.json`; `runLlmRepairGate` skickar till `runLlmFixer` som max 6 mönster med `occurrences >= 2`.

### Risk (stale patterns)

Läser **`latest/`** per chat — inte full historik; JSDoc kan säga "previous runs" men implementation är snapshot-baserad.

### Confidence (%)

Hjälper stabilitet inom samma run med upprepade fel: **medel**. Cross-run minne: **lägre**.

### Improvements

- Aggregera från `history.ndjson` om chat-långt minne önskas.  
- Synka JSDoc med beteende.

**Model:** composer-2-fast (subagent)
