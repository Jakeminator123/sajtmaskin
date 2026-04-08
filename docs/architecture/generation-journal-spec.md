# Generation Journal — design spec

**Status:** proposed (not yet implemented)
**Created:** 2026-04-08

## Problem

After a generation, observability data is scattered across three separate sources:

1. **Prompt dumps** (`data/prompt-dumps/`) — full system prompt and dynamic context, opt-in via `SAJTMASKIN_PROMPT_DUMP=1`
2. **Prompt logs** (`prompt_logs` DB table) — best-effort log of original/formatted prompt, model tier, build method; requires admin auth to read
3. **Dev/runtime logs** (`logs/sajtmaskin-local.log`, `logs/sajtmaskin-local-document.txt`) — rolling event log with generation timeline, autofix, syntax validation, quality gate, preview lifecycle

There is no single artifact that ties together: scaffold selection, brief output, route plan, contracts, token usage, quality gate results, repair passes, and final outcome for one generation run.

## Goal

A per-generation journal file (or directory) under `logs/generations/` that collects everything needed to understand what happened in one generation, without cross-referencing multiple sources.

## Proposed format

Each generation run creates a directory:

```
logs/generations/{timestamp}--{slug}/
  journal.json        # structured summary (machine-readable)
  journal.md          # human-readable summary
  system-prompt.md    # full system prompt (static + dynamic) if dump enabled
  dynamic-context.md  # dynamic-only context
  timeline.ndjson     # event timeline (already exists in generation-log-writer)
```

### `journal.json` schema (key fields)

```json
{
  "chatId": "...",
  "versionId": "...",
  "timestamp": "...",
  "prompt": {
    "original": "user text",
    "optimized": "after orchestration",
    "strategy": "direct|summarize|...",
    "type": "freeform|audit|...",
    "lengthOriginal": 360,
    "lengthOptimized": 2302
  },
  "brief": {
    "applied": true,
    "source": "client|server-auto",
    "model": "openai/gpt-5.4",
    "durationMs": 52000,
    "pageCount": 5
  },
  "scaffold": {
    "id": "landing-page",
    "family": "landing-page",
    "method": "keyword",
    "confidence": "high",
    "keywordScores": { "ecommerce": 0, "landing-page": 3, "content-site": 4 },
    "hospitalityVeto": true
  },
  "routePlan": {
    "siteType": "brochure",
    "routeCount": 5,
    "provenance": "brief"
  },
  "contracts": {
    "dataMode": "none",
    "database": null,
    "payment": null,
    "integrations": []
  },
  "capabilities": {
    "needsEcommerce": false,
    "needsForms": true,
    "needsMotion": false
  },
  "generation": {
    "model": "gpt-5.3-codex",
    "tier": "pro",
    "thinking": false,
    "imageGenerations": true,
    "inputTokens": 14197,
    "outputTokens": 5519,
    "durationMs": 58899,
    "reasoningMs": 0,
    "outputMs": 57451
  },
  "postProcessing": {
    "autofixCount": 1,
    "syntaxErrors": 0,
    "llmFixerPasses": 0,
    "imageMaterialized": 4,
    "verifierSkipped": false
  },
  "qualityGate": {
    "ran": true,
    "passed": true,
    "checks": [
      { "check": "install", "passed": true, "exitCode": 0, "durationMs": 45000 },
      { "check": "typecheck", "passed": true, "exitCode": 0, "durationMs": 12000 }
    ],
    "totalDurationMs": 91000
  },
  "repair": {
    "triggered": false,
    "passes": 0,
    "scaffoldPivot": null
  },
  "preview": {
    "tier": 2,
    "started": true,
    "outcome": "recreated",
    "blocked": false
  },
  "readiness": {
    "status": "warning",
    "blockers": 0,
    "warnings": 1
  },
  "filesGenerated": 37,
  "lineageHash": "abc123..."
}
```

### `journal.md` format (human-readable)

```markdown
# Generation Journal

- Chat: 570a5140-fcc3-4af6-8776-e543dc2aa635
- Version: fcd18627-a374-4471-aac6-f3fe74ff5240
- Timestamp: 2026-04-08T12:15:08Z

## Prompt
- Original: 360 chars
- Optimized: 2302 chars (direct, freeform)

## Brief
- Source: client (deep brief)
- Model: openai/gpt-5.4
- Duration: 52s
- Pages: 5

## Scaffold
- Selected: landing-page (keyword, high confidence)
- Hospitality veto applied (restaurant domain detected)

## Generation
- Model: gpt-5.3-codex (pro)
- Tokens: 14197 in / 5519 out
- Duration: 59s

## Quality Gate
- PASS: install (45s), typecheck (12s)

## Files: 37
```

## Implementation notes

- The journal writer should live alongside `generation-log-writer.ts` in `src/lib/logging/`
- It should be called from `finalizeAndSaveVersion` or from the stream post-finalize path
- It should be opt-in initially (env flag) and eventually always-on in dev
- The `journal.json` format should be stable enough for dashboard/eval tooling to consume
- Existing `generation-log-writer.ts` already writes per-run directories under `logs/generations/`; the journal extends that with a structured summary

## Relationship to existing logging

| Source | Kept | Extended |
|--------|------|----------|
| `generation-log-writer.ts` (timeline.ndjson, summary.md, meta.json) | Yes | journal.json/md added alongside |
| `prompt-dump.ts` (data/prompt-dumps/) | Yes | journal optionally copies system prompt into run dir |
| `prompt_logs` DB table | Yes | journal.json duplicates key fields for offline access |
| `devLog.ts` (logs/sajtmaskin-local.log) | Yes | unchanged |

## Next steps

1. Implement `writeGenerationJournal()` in `src/lib/logging/`
2. Call it from finalize path
3. Add env flag `SAJTMASKIN_GENERATION_JOURNAL=1`
4. Wire journal.json into `/api/dev-log` and `/log` viewer
