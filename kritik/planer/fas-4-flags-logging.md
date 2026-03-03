# Fas 4: Feature Flags + Logging + Prompt Heuristics

## Scope
- R1-7: isV0StreamingEnabled -> env-driven
- R1-5: logFinalPrompt -> dev-only
- R1-10: Prompt heuristics -> metadata flag

## Files to modify
- `src/lib/v0/v0-generator.ts` — streaming toggle + prompt heuristic replacement
- `src/lib/utils/debug.ts` — guard logFinalPrompt behind env check

## Acceptance criteria
- V0_STREAMING_ENABLED=false disables streaming
- No full prompt logged in production (NODE_ENV=production)
- Prompt expansion detected via metadata, not substring matching

## Test plan
- Unit test: isV0StreamingEnabled() with/without env var
- Manual: verify prod logs contain no prompts
