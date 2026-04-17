# Arkitektur — oversikt

**Senast strukturerad om:** 2026-04-15

Detta ar ingangssidan for arkitekturdokumentationen.

- Kod ar alltid source of truth.
- Fasnamn (Fas 1/2/3) ar kanoniska.
- "Steg 3/4/5" anvands inte langre som primar struktur i docs.

---

## Snabb orientering

- Rottrad och mappansvar: [repo-tree.md](./repo-tree.md)
- Terminologi: [`../../.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc)
- Full ordlista: [glossary.md](./glossary.md)

---

## Fasdokument (kanonisk LLM-kedja)

| Fas | Dokument | Fokus |
|---|---|---|
| 1 | [fas1-startprompt-flow.md](./fas1-startprompt-flow.md) | Prompt in, assist, brief, init/follow-up-ingang |
| 2 | [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) | Orkestrering, LLM-input, finalize/autofix/verifier/persist |
| 3 | [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md) | Preview-host/VM, lifecycle, quality-gate, deploy |

---

## Ovriga centrala dokument

| Dokument | Vad det tacker |
|---|---|
| [builder-generation.md](./builder-generation.md) | Kort nav for builderns LLM-pipeline |
| [llm-signal-flow.md](./llm-signal-flow.md) | Hur signallager samspelar i kedjan |
| [preview-white-screen-runbook.md](./preview-white-screen-runbook.md) | Felsokning av vit/tom preview |
| [scaffold-schema.md](./scaffold-schema.md) | Scaffold-systemets fulla schema |
| [scaffold-variants-inventory.md](./scaffold-variants-inventory.md) | Per-scaffold och per-variant inventarium med kvalitetsbedomning + cleanup-forslag (beslutsunderlag) |
| [template-scaffold-lane.md](./template-scaffold-lane.md) | Botten-till-toppen-karta: Vercel-skrapan -> dossiers -> library -> variants -> runtime-prompt. Lane-ownership-dokument. |
| [dossier-format.md](./dossier-format.md) | Schema och kontrakt for dossier-mappar (data/dossiers/). Kategorier, faltforklaringar, embedding-strategi. |
| [dossier-pipeline-roadmap.md](./dossier-pipeline-roadmap.md) | Fas-uppdelad plan for nya dossier-pipen (skrap -> kuration -> embeddings -> runtime-migration -> avveckling av gammal pipeline). Trackar progress. |
| [system-overview.md](./system-overview.md) | Hog niva: motor, builder, preview, deploy |
| [repository-and-platform.md](./repository-and-platform.md) | Repohygien, plattformsgrans och nav |

---

## Snabblankar till kod

- `src/lib/gen/`
- `src/lib/providers/own-engine/`
- `src/lib/models/catalog.ts`
- `config/ai_models/manifest.json`
- `docs/schemas/README.md`
