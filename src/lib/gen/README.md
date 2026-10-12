# gen/ — Code Generation Module

Own-engine-codegen för genererade Next.js/React-projekt. Börja med ägaren för
den aktuella frågan; körflödet kartläggs i [LLM-pipeline](../../../docs/architecture/llm-pipeline.md).

## Kodankare

| Fråga | Ägare |
| --- | --- |
| Beslutat byggunderlag och lineage | [GenerationInputPackage](generation-input-package.ts), byggd av [generation-package.ts](orchestrate/generation-package.ts) efter [orchestrate.ts](orchestrate.ts) |
| Init/follow-up och requestens user message/historik | [create-chat-stream-post.ts](../api/engine/chats/create-chat-stream-post.ts), [codegen-turn.ts](../api/engine/chats/chat-message-stream/codegen-turn.ts) |
| Systemprompt och budgeterad kontext | [system-prompt/](system-prompt/), [config/](../../../config/README.md) |
| Modellanrop och SSE | [engine.ts](engine.ts), [stream-format.ts](stream/stream-format.ts) |
| Gemensam projektkandidat mot scaffold/basversion | [finalize-merge.ts](stream/finalize-merge.ts), [version-file-merge.ts](version-file-merge.ts) |
| Komplett preflight före semantic verifier; omberedning efter repair | [fast-path.ts](stream/finalize-version/fast-path.ts), [preflight-phase.ts](stream/finalize-version/preflight-phase.ts), [verifier-phase.ts](stream/finalize-version/verifier-phase.ts) |
| Persist och versionsresultat | [finalize-version/](stream/finalize-version/), [version-manager.ts](version-manager.ts) |
| Live-preview via preview-host/VM | [preview-session.ts](preview/preview-session.ts), [preview-host-client.ts](preview/preview-host-client.ts); kompatibilitets-URL:er: [legacy/](preview/legacy/) |
| Eval och dess kontrollunderlag | [eval/README.md](eval/README.md), [runner.ts](eval/runner.ts) |
| Exportberedning | [build-exportable-project.ts](export/build-exportable-project.ts), [project-scaffold.ts](export/project-scaffold.ts) |

`GenerationInputPackage` äger orkestreringens beslut och systemkontext.
User-turn och historik monteras fortfarande i requestlagret. Finalize tar de
beslutade delarna via `GenerationFinalizeInput`; det ersätter inte hela
modellanropets request.

Verifiern läser den kompletta beredda kandidaten, med env-värden redakterade.
Ändras projektet under repair körs beredningen igen före bekräftelsen. Eval
återanvänder kandidatberedningen och bedömer runtime mot `canonicalRuntimeFiles`
efter preflight; modellens råoutput är ett separat kontrollunderlag.

## Domäner och artefakter

[Scaffolds](scaffolds/README.md), [varianter](scaffold-variants/) och
[dossiers](dossiers/) har olika ansvar. Läs deras owner innan ett genererat
index öppnas. Scaffold-research och embeddings kan påverka runtime/tooling
även när de är gitignorerade eller saknar vanlig editorindexering.
Regenerera via [scripts/README.md](../../../scripts/README.md) och verifiera
kommandot i [package.json](../../../package.json); handredigera inte index som
normal arbetsgång. Eval har en publik ingång: `npm run eval`.

Produktterminologi: [terminology.mdc](../../../.cursor/rules/terminology.mdc).
Repoorientering: [code-map.md](../../../docs/architecture/code-map.md).
En verklig generation verifieras genom builderns streaming-API och versionens
filer; [local-dev-generation](../../../docs/runbooks/local-dev-generation.md)
beskriver den lokala körningen.

Suspense-regler implementerar `SuspenseRule` i [suspense/transform.ts](suspense/transform.ts)
och registreras via `createDefaultRules` i [default-rules.ts](suspense/default-rules.ts).
Regelordningen gäller; preview-only-regler får inte ändra persisterade filer,
och en misslyckad transform lämnar raden oförändrad.
