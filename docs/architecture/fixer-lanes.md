# Fixer Lanes

Denna sida definierar lane-kontrakten for fixer-systemet. Malet ar tydliga entrypoints per lane, inte en monolit.

## Lane-kontrakt

| Lane | Entrypoint | Nar den kor | Input | Output | Far mutera |
|---|---|---|---|---|---|
| `mechanical` | `runAutoFix()` i `src/lib/gen/autofix/pipeline.ts` | Under finalize/validate nar kandidatversion byggs | CodeProject-innehall | Mekaniskt reparerat innehall + `FixEntry[]` | Kandidatens filer |
| `static_gate` | `validateAndFix()` + `runFinalizePreflightAll()` | Efter mekanisk lane for gate-signaler | Kandidatens filer | Valideringsresultat/preflight-issues | Ingen kod (bara signaler) |
| `llm_repair` | `runLlmRepairGate()` (syntax + verifier) | Nar static-gate blockerar | Kandidat + fel-sammanfattning | LLM-reparerat kandidatinnehall (eller noop) | Kandidatens filer |
| `stream_suspense` | `createDefaultRules()` i `src/lib/gen/suspense/default-rules.ts` | Under streamning, rad-for-rad | Stream-rader | Transformerade rader fore parse/finalize | Endast stream-buffer/context |
| `post_merge` | `repairGeneratedFiles()` + `fixTypeOnlyModuleDefaultImports()` | Efter merge/scaffold-preflight | Merged `CodeFile[]` | Reparerat merged filset + fixes | Merged filset |
| `server_repair` | `runRepairLoop()` i `src/lib/gen/verify/repair-loop.ts` | Efter server-verify/quality-gate-fel | Persistad version + verifierfel | Reparerad serverversion eller early-stop | Persistad version |

## Lane-granser

- `runAutoFix()` ar entrypoint for mekanisk lane; den producerar lane-taggade `FixEntry` (`mechanical`).
- `repairGeneratedFiles()` ar separat post-merge lane; samma fixer-id kan forekomma men taggas `post_merge`.
- `createDefaultRules()` ar enda default-vag till suspense-rules i streaming-lane.
- Server-repair (`runRepairLoop`) ar separat lane och konsolideras inte med autofix-lane.
