# Sajtmaskin

Sajtmaskin är en AI-driven builder som gör en prompt till en versionerad
React/Next.js-sajt, visar den i live-preview och kan gå vidare till explicita
integrationer och publicering.

```text
prompt/brief → orchestration → BuildSpec → prompt/context → code generation
→ Normalize/finalize + kandidatkontroller → persisterad draft/version
→ preview-handoff + post-check → RenderGate eller ReleaseGate
→ promote, Advisory, Blocker eller RepairGate → follow-up eller deploy
```

## Starta lokalt

Krav: Node.js-versionen i `package.json` och npm.

```text
npm ci
npm run dev
```

Miljövariabler och databasstart beskrivs i [`docs/ENV.md`](docs/ENV.md).
Dev-servern kan startas utan predev med
`node scripts/dev/next-runner.mjs dev`.

## Hitta rätt kod

| Område                           | Börja här                                                               |
| -------------------------------- | ----------------------------------------------------------------------- |
| Builder och chat                 | `src/app/builder/`, `src/components/builder/`, `src/lib/hooks/chat/`    |
| Own-engine och generation        | `src/lib/own-engine/`, `src/lib/providers/own-engine/`, `src/lib/gen/`  |
| Scaffolds, variants och dossiers | `src/lib/gen/scaffolds/`, `config/scaffold-variants/`, `data/dossiers/` |
| Preview                          | `src/lib/gen/preview/`, `preview-host/`                                 |
| Persistens                       | `src/lib/db/`, `scripts/db/`                                            |
| Publicering                      | `src/app/api/v0/deployments/`, `src/lib/deploy/`                        |
| Konfiguration                    | `config/`, `src/lib/env.ts`                                             |

Den tunna kodkartan finns i
[`docs/architecture/code-map.md`](docs/architecture/code-map.md).

## Dokumentation

1. [`docs/README.md`](docs/README.md) — dokumentationsrouter.
2. [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md)
   — stabil huvudloop.
3. [`docs/concepts/mental-model.md`](docs/concepts/mental-model.md) —
   begreppen i ett sammanhang.
4. [`docs/architecture/runtime-contracts.md`](docs/architecture/runtime-contracts.md)
   — invariants och signalägare.
5. [`.cursor/README.md`](.cursor/README.md) — agentregler och arbetsflöden.

Canonical owner avgörs per faktatyp. Runtimekod, manifest, registries och
policies kan äga olika beslut; genererad eller handskriven dokumentation är
projektion respektive mental modell. Owner-modellen finns i
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md).

## Verifiera repot

```text
npm run typecheck
npm run lint
npm run test:ci
npm run build
npm run scaffolds:validate
npm run dossiers:validate-all
```

`package.json` är kanonisk källa för tillgängliga kommandon.
