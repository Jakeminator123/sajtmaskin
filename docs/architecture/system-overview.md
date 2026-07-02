# Systemöversikt

Sajtmaskin är en AI-driven builder för webbplatser och webbappar. Användaren beskriver en idé i buildern, systemet genererar React/Next.js-kod via own-engine, visar live-preview och kan sedan gå vidare mot integrationer och deploy.

## Huvudloop

```txt
prompt
  -> brief / intent
  -> orchestration
  -> codegen
  -> finalize / repair / verify
  -> version
  -> preview
  -> follow-up eller F3/deploy
```

## Huvudlager

| Lager | Ansvar | Kodankare |
|---|---|---|
| Builder UI | Chat, versioner, previewpanel, quick-edit-yta | `src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/` |
| Own-engine boundary | Stream, meta, modellval, route-handlers | `src/lib/own-engine/`, `src/lib/providers/own-engine/` |
| Generation core | Orkestrering, scaffolds, dossiers, prompts, repair | `src/lib/gen/` |
| Persistens | Engine chats, messages, versions, jobs, logs | `src/lib/db/`, `scripts/db/` |
| Preview | VM/preview_host-session, patch/restart, env-local | `src/lib/gen/preview/`, `preview-host/` |
| Deploy | Vercel-projekt, deployments, domains | `src/lib/deploy/`, `src/lib/vercel/`, `src/app/api/v0/deployments/` |
| Backoffice/observability | Operativ analys och felsökning | `backoffice/`, `sajtmaskin_backoffice.py`, `scripts/observability/` |

## Kärnobjekt

| Objekt | Kort betydelse |
|---|---|
| `engine_chats` | En own-engine chat/lane. Bär bland annat senaste `orchestration_snapshot`. |
| `engine_messages` | Chatmeddelanden och UI-parts/thinking. |
| `engine_versions` | Immutable versioner med `files_json`, preview/status, F2/F3 stage och quick-edit-provenance. |
| `BuildSpec` | Runtime-policy för generationens scope, kvalitet, preview och verifiering. |
| `Dynamic Context` | Request-specifik promptdel som byggs från scaffold, variant, brief, route plan, contracts, dossiers och guidance. |
| `EngineEvent` | Append-only runtime-händelse som projiceras till `VersionStatus`. |

## Viktiga gränser

### Init vs follow-up

Init får välja scaffold, variant, route plan och capabilities från början. Follow-up ska utgå från befintlig version och bevara det som inte uttryckligen ändras.

### F2 vs F3

F2 är design/preview: renderbar, itererbar, snabb. F3 är integration/build: riktiga env-värden, server-wiring och deploybar build. F3 ska vara explicit, inte en bieffekt av promptheuristik.

### Scaffold vs dossier

Scaffold är basprojektets runtime-startpunkt. Dossier är en capability-modul som kan injicera mönster, komponenter eller integrationsglue. De ska inte användas som två namn för samma sak.

### Preview vs deploy

Preview är VM/runtime för iteration. Deploy är Vercel-spåret. En grön preview betyder inte automatiskt deployklar F3.
