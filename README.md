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

Kodens kanoniska router finns i
[`docs/architecture/code-map.md`](docs/architecture/code-map.md). Uppdatera
kodkartan när ett ansvar flyttar; skapa inte en parallell sökvägstabell här.

## Dokumentation

1. [`docs/README.md`](docs/README.md) — dokumentationsrouter.
2. [`FUSKLAPP-BYGGBLOCK.md`](FUSKLAPP-BYGGBLOCK.md) — Byggblock/dossiers på en sida
   (inga poolantal; koden vinner vid drift).
3. [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md)
   — stabil huvudloop.
4. [`docs/concepts/mental-model.md`](docs/concepts/mental-model.md) —
   begreppen i ett sammanhang.
5. [`docs/architecture/runtime-contracts.md`](docs/architecture/runtime-contracts.md)
   — invariants och signalägare.
6. [`.cursor/README.md`](.cursor/README.md) — agentregler och arbetsflöden.

Canonical owner och dokumentationsnivåer definieras i
[`docs/documentation-lifecycle.md`](docs/documentation-lifecycle.md).

## Verifiera repot

`package.json` är kanonisk källa för tillgängliga kommandon. Minsta verifiering
per ändringstyp finns i [`.cursor/rules/workflow.mdc`](.cursor/rules/workflow.mdc)
och den tunna kommandoöversikten i
[`.cursor/rules/useful-commands.mdc`](.cursor/rules/useful-commands.mdc).
Manuella underhållsknappar (scratch, worktrees, env) som CI _inte_ kör:
[`UNDERHALL.md`](UNDERHALL.md).
