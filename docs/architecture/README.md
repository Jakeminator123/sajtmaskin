# Arkitektur — översikt

**Senast strukturerad om:** 2026-04-10. Arkiv: git-historik.

**Vad det här är:** en **ingångs**-sammanfattning i vanlig markdown — inte en tjänst, MCP-server eller “hub” i teknisk mening. Den här mappen beskriver **hur Sajtmaskin är uppbyggt** (egen motor, builder, preview, integrationer, repo). Produktordlista för agenter: [`.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc). Nav i hela `docs/`: [`docs/README.md`](../README.md).

## Snabb orientering (rot-träd)

[Karta över rotmappar och två “data”-begrepp](./repo-tree.md) — läs före du gräver i detalj nedan.

## De centrala huvuddokumenten

| Dokument | Vad det täcker |
|----------|----------------|
| [system-overview.md](./system-overview.md) | Motorflöde, modellager, builder-entry (`BuildMethod`), handoff till planer |
| [builder-generation.md](./builder-generation.md) | Promptlager, modellval & trace, SSE, generation loop, UX-kontrakt, projektinställningar |
| [llm-input-blocks.md](./llm-input-blocks.md) | Steg 3: vad som når modellen (system vs user-turn vs historik), budget/pruning |
| [llm-signal-flow.md](./llm-signal-flow.md) | Hur prompt assist, Deep brief, scaffold, route plan, capabilities, contracts och post-checks samspelar |
| [step4-post-generation.md](./step4-post-generation.md) | Steg 4: finalize, validate, verifier, preflight, fast-only vs fast+deep, gräns mot Steg 5 |
| [preview-deploy.md](./preview-deploy.md) | Tier-2 preview via `preview_host` / VM, preview-session lifecycle, legacy shim/compat, fidelity tiers, deploy-precheck |
| [preview-white-screen-runbook.md](./preview-white-screen-runbook.md) | Vit/tom preview: felsökning, loggar, förebyggande; speglar UI-runbook |
| [scaffold-schema.md](./scaffold-schema.md) | Scaffold-systemets fullständiga schema: flöde, typer, matris, merge-pipeline |
| [repository-and-platform.md](./repository-and-platform.md) | Mappar & terminologi, doc-livscykel, repo-hygien, skript/scaffolds, kände fel, v0-deprecation, Vercel-mallar/webhooks, övriga integrationer |

## Dokumentlivscykel

Policy: [`documentation-lifecycle.md`](./documentation-lifecycle.md).

## Snabblänkar (kod som sanning)

- `src/lib/gen/` — egen motor, stream, preview, sandbox
- `src/lib/models/catalog.ts` — byggprofiler / modell-ID
- `config/ai_models/manifest.json` — manifest för modeller
- `docs/schemas/README.md` — schema-dokumentation
