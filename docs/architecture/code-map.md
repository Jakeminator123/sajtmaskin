# Code map

Den här filen är en tunn orientering. Den ska inte ersätta `rg`, IDE-index eller GitHub-sök.

## Runtime-kärna

| Område | Primär plats | När du går hit |
|---|---|---|
| Orkestrering | `src/lib/gen/orchestrate.ts`, `src/lib/gen/orchestrate/` | Signalflöde, scaffold/variant/route/contracts/BuildSpec fan-in. |
| BuildSpec | `src/lib/gen/build-spec/` | Scope, preview policy, verifiering, tokenbudget, route realization. |
| System prompt | `src/lib/gen/system-prompt/`, `config/prompt-core/` | Core Rules, Dynamic Context, prompt pruning. |
| Scaffolds | `src/lib/gen/scaffolds/` | Runtime-startpunkter, scaffold matching, scaffold-owned files. |
| Variants | `src/lib/gen/scaffold-variants/`, `config/scaffold-variants/` | Visuell variant, variant lock, design axes. |
| Dossiers | `src/lib/gen/dossiers/`, `data/dossiers/` | Capability-moduler, verbatim policy, F2/F3 boundary. |
| Route plan | `src/lib/gen/route-plan/` | IA/routes, route freeze/floor. |
| Contracts | `src/lib/gen/contract/`, `src/lib/gen/orchestration-contract*` | Auth/payment/database/env/integration-beslut. |
| Autofix/repair | `src/lib/gen/autofix/`, `src/lib/gen/repair/` | Mekaniska fixers och LLM-fix. |
| Finalize | `src/lib/gen/stream/finalize-version/`, `src/lib/gen/stream/finalize-merge.ts` | Parse, merge, repair, preflight, save. |
| Verify/quality gate | `src/lib/gen/verify/` | Typecheck/build/lint lanes, verifier, postcheck, stale settle. |
| Preview | `src/lib/gen/preview/`, `preview-host/` | VM-session, env-local, patch/restart, host API. Prewarm app-ingång: `preview-prewarm.ts`; host ownership/lease: `preview-host/src/server.js`, `runtime.js`, `prewarm-leases.js`. |
| Quick edit | `src/lib/gen/quick-edit/`, `src/lib/builder/engine-files-patch.ts` | Deterministiska minor-versioner utan LLM. |
| Capability removal | `src/lib/builder/follow-up-capability-removal.ts`, `src/lib/gen/capability-removal.ts`, `src/lib/gen/stream/finalize-merge.ts` | Explicit "ta bort integration": signal-subtraktion, snapshot/meta och manifestägd filradering. |
| Sidhantering (+/− i preview) | `src/lib/builder/preview-page-ops.ts` | Skapa/ta bort sida + nav-länk via quick edit. Kontrakt i filens header — nav-kirurgi måste vara `asChild`/Slot-säker (sibling i en Slot ⇒ runtime-krasch). |

## API- och UI-ytor

| Område | Primär plats |
|---|---|
| Create-chat stream | `src/app/api/engine/chats/stream/`, `src/lib/api/engine/chats/create-chat-stream-post.ts` |
| Follow-up stream | `src/app/api/engine/chats/[chatId]/stream/`, `src/lib/api/engine/chats/chat-message-stream-post.ts` |
| Quality gate route | `src/app/api/engine/chats/[chatId]/quality-gate/` |
| Finalize design / F3 | `src/app/api/engine/chats/[chatId]/finalize-design/` |
| F3 klientorkestrering | `src/lib/builder/f3-finalize-action.ts`, `src/components/builder/F3RequirementsSurface.tsx`, `src/components/builder/preview-panel/PreviewPanelF3Trigger.tsx` |
| Preview session | `src/app/api/engine/chats/[chatId]/preview-session/` |
| Quick edit route | `src/app/api/engine/chats/[chatId]/quick-edit/` |
| Byggblock-panel (dossiers) | `GET /api/engine/chats/[chatId]/dossiers` (inkopplade per version) · `GET /api/dossiers/catalog` (hela katalogen, statisk) · UI: `src/components/builder/preview-panel/PreviewPanelDossiers.tsx` |
| Builder UI | `src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/` |

## Persistens och drift

| Område | Primär plats |
|---|---|
| Drizzle schema | `src/lib/db/schema.ts` |
| DB init/migrations | `scripts/db/`, `src/lib/db/migrations/` |
| Chat repository | `src/lib/db/chat-repository-pg.ts` |
| Event bus | `src/lib/logging/event-bus-types.ts`, `src/lib/logging/event-bus-projection.ts` |
| Observability | `scripts/observability/`, `backoffice/` |
| Env | `src/lib/env.ts`, `config/env-policy.json`, `scripts/env/` |
| Models | `config/ai_models/manifest.json`, `src/lib/models/` |
| Auth (3 medvetna lager) | `src/lib/auth/session.ts` (anonym gäst-cookie) · `src/lib/auth/auth.ts` (inloggad JWT + OAuth, `getCurrentUser`) · `src/lib/auth/edge-auth.ts` + `src/proxy.ts` (edge-gate). Admin-gate: `src/lib/auth/admin.ts`. UI/klient-state: `src/components/auth/*` + `src/lib/auth/auth-store.ts`. |
| Templates | Data-kedja `src/lib/templates/template-data.ts` → `template-catalog.ts` → `client.ts` (UI läser lib direkt). Routes: `POST /api/template` (init/mutation), `POST /api/templates/search` (embedding-sök). Embeddings-ägare: `src/lib/templates/template-embeddings-core.ts`. Kanonisk väg + guardrails: `docs/architecture/templates.md`. |

## Sökfraser vid felsökning

```bash
rg "resolveOrchestrationBase|prepareGenerationContext" src/lib/gen
rg "deriveBuildSpec|previewPolicyOverride" src/lib/gen/build-spec src/lib/gen/orchestrate.ts
rg "composeEngineSystemPrompt|buildDynamicContext" src/lib/gen/system-prompt
rg "dossierRequiresF3|getF3RequiredCapabilities|selectedDossierIds" src data
rg "DESIGN_PREVIEW_QUALITY_GATE_CHECKS|INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS|isTypecheckOnlyAdvisory" src/lib/gen/verify
rg "EngineEventType|VersionDegradationKind|selectVersionStatus" src/lib/logging
rg "runQuickEdit|tryPatchPreviewSession" src/lib/gen
rg "engineVersions|lifecycleStage|editKind|parentVersionId" src/lib/db scripts/db
```

## Dokumentationsregel

När en kodkarta börjar kräva exakta radnummer eller fullständiga listor ska den ersättas av script, test eller schema. Architecture-docs ska bara peka rätt.
