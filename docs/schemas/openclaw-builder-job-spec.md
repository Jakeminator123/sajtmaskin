# OpenClaw Builder job contract

`BuilderJobSpec` is the server-owned envelope for the new, separate OpenClaw
Builder. Its TypeScript and runtime-validation owner is
`src/lib/openclaw-builder/builder-job-spec.ts`; the strict JSON Schema mirrors
that shape at `docs/schemas/strict/openclaw-builder-job-spec.schema.json`.

## Ownership boundary

Sajtmaskin supplies tenant, project/chat, base version, base file revision,
package/lineage hashes, scopes, allowed tools, budgets, lease and idempotency.
P0 exposes no public create-job API, and its client-intent parser accepts no
fields. A client therefore cannot mint or widen any of those grants.

Both `baseVersionId` and `baseFilesRevision` are mandatory. A mismatch is
`stale`; no builder may rebase or persist against a newer snapshot on its own.
`engine_versions.files_json` remains the canonical project snapshot.

## Lanes and availability

- `classic` is the only available P0 lane.
- `openclaw_shadow` is declared but unavailable until the read-only agent and
  shadow planner exist.
- `openclaw_candidate` is declared but unavailable until the sandbox and write
  broker exist.

Both server flags are default-off. Even if one is set during P0, the resolver
falls back to `classic` with `lane_unavailable`; it never silently grants a
capability that has not shipped.

## Integration seam

The package is frozen by `buildGenerationInputPackage` in the init and
follow-up codegen handlers. P0 creates a deterministic receipt immediately
after that call and forwards only the scrubbed receipt trace through
`createOwnEnginePipelineAndGenerationStream` to finalize telemetry. Classic
codegen still starts through the same own-engine function, with the same
prompts, tools, files and stream metadata.

This boundary is the future dispatch seam: a later phase may select a
read-only shadow lane after the package is frozen and before classic codegen
starts. P0 has no OpenClaw agent, gateway call, write broker, public route or
candidate persistence path.

## State, lease and replay

`src/lib/openclaw-builder/state-machine.ts` owns pending/running and all
terminal outcomes: completed, failed, stale, cancelled, superseded and expired.
Terminal jobs are never revived. A retry decision creates a new job for a
retryable terminal result; cancel and completion are not retryable. Heartbeats
can extend only a running, non-expired lease and never pass its absolute limit.

Result acceptance is idempotent. Replaying the same idempotency key, result id
and candidate hash returns the existing acceptance; any different payload on
the same key is a conflict, and a second key cannot create another accepted
result.

## Audit and telemetry

Audit events carry a tenant hash and an allowlisted metadata subset. Prompt,
code, project files, env, tokens, authorization and arbitrary nested payloads
are not valid audit metadata.

P0 reuses the package lineage/source receipts and incrementally hashes large
prompt and scaffold-file content. Canonical JSON sees only a bounded projection
of digests and low-cardinality routing metadata, never the full package text.
A scrubbed classic execution trace is then added to the existing generation
telemetry row. The trace ends honestly at finalize. Its explicit `version_id`
correlation joins to the canonical VM-gate verdicts in
`engine_version_error_logs`, where RenderGate (`designPreview`) and ReleaseGate
(`integrationsBuild`) are stored. `generation_telemetry.qualityGateResult`
remains finalize-only and is not misrepresented as the later VM-gate verdict.

The five package fixtures cover init, follow-up, F2, F3 and import receipt
shapes. They are not an execution simulator. Existing init/follow-up route
tests own classic pipeline and SSE parity; the P0 fixture harness owns only
deterministic package hashing and default lane selection.
