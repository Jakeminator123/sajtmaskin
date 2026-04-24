# Arkitektur — översikt

**Senast uppdaterad:** 2026-04-23.

Ingångssida för arkitekturdokumentationen.

- **Kod är alltid source of truth.**
- Fasnamn (Fas 1 / Fas 2 / Fas 3) är kanoniska. "Steg 3/4/5" och "Fas 4" används inte längre.
- Hierarki vid konflikt: `docs/schemas/strict/*.schema.json` > `docs/schemas/*.md` > docs/architecture > backoffice (`sajtmaskin_backoffice.py`).
- **Vart vi siktar:** [`llm-flow-target-worldclass.md`](./llm-flow-target-worldclass.md) — norra stjärna för LLM-flödet (3-fasmodell, single repair gate, status event bus, init/follow-up som distinkta operationer).

---

## Snabb orientering

| | Dokument |
|---|---|
| Rottrad och mappansvar | [repo-tree.md](./repo-tree.md) |
| Repohygien, plattformsgräns, OpenClaw-yta | [repository-and-platform.md](./repository-and-platform.md) |
| Hög nivå: motor, builder, preview, deploy | [system-overview.md](./system-overview.md) |
| Full ordlista | [glossary.md](./glossary.md) |
| Terminologi-rule | [`../../.cursor/rules/terminology.mdc`](../../.cursor/rules/terminology.mdc) |
| Plan/doc-policy | [documentation-lifecycle.md](./documentation-lifecycle.md) |

---

## Kanonisk LLM-kedja (fasdokument)

| Fas | Dokument | Fokus |
|---|---|---|
| 1 | [fas1-startprompt-flow.md](./fas1-startprompt-flow.md) | Prompt in, assist, brief, init/follow-up-ingång |
| 2 | [fas2-orchestration-and-build.md](./fas2-orchestration-and-build.md) | Orkestrering, LLM-input, finalize/autofix/verify/persist |
| 3 | [fas3-preview-and-deploy.md](./fas3-preview-and-deploy.md) | Preview-host/VM, lifecycle, quality-gate, deploy |

Komplement:

| Dokument | Vad det täcker |
|---|---|
| [**llm-flow-target-worldclass.md**](./llm-flow-target-worldclass.md) | **Målbild** — vart LLM-flödet siktar (3-fasmodell, single repair gate, status event bus, init/follow-up som distinkta operationer). Använd som referens vid PR-review och triage. |
| [llm-flow-end-to-end.md](./llm-flow-end-to-end.md) | "Vad händer när användaren skickar en prompt?" — kort end-to-end |
| [llm-signal-flow.md](./llm-signal-flow.md) | Hur signallager samspelar + ägarmatris (canonical source per signal) |
| [mental-model-vs-actual-flow.md](./mental-model-vs-actual-flow.md) | Användarintuition vs verklig implementation + gap mot målbild |
| [followup-design-intent-gap.md](./followup-design-intent-gap.md) | Varför design-intent follow-ups ibland missar `globals.css` |

---

## Scaffold-system

| Dokument | Vad |
|---|---|
| [scaffold-system.md](./scaffold-system.md) | Scaffold-systemets arkitektur + per-scaffold/per-variant inventarium med kvalitetsbedömning. Rent kontrakt finns i [`../schemas/scaffold-contract.md`](../schemas/scaffold-contract.md). |
| [component-library-policy.md](./component-library-policy.md) | Policy: scaffolds vs shadcn vs capability-gated deps |

---

## Dossier-system

| Dokument | Vad |
|---|---|
| [dossier-system.md](./dossier-system.md) | Format, schema, urvalsalgoritm, hur man lägger till nya. Allt i en fil. |
| [_archived/dossier-format.md](./_archived/dossier-format.md), [_archived/dossier-pipeline-roadmap.md](./_archived/dossier-pipeline-roadmap.md), [_archived/dossier-promotion-flow.md](./_archived/dossier-promotion-flow.md) | Legacy v1-pipeline (auto-curate, embeddings, scaffold-recommendations) — ersatt 2026-04-20. Bara historik. |

---

## Drift och felsökning

| Dokument | Vad |
|---|---|
| [preview-white-screen-runbook.md](./preview-white-screen-runbook.md) | Felsökning av vit/tom preview |

---

## Modellbanor i buildern (snabbreferens)

| Bana | Vad den styr |
|---|---|
| Byggmodell (`fast`/`pro`/`max`/`codex`/`anthropic`) | Generation/refine-streamen |
| Prompt assist | Deep brief, rewrite och promptverktyg |
| Polish | "Skriv om"-lanen (lätt omskrivning) |
| Thinking | Resonemangsflagga, inte separat modellbana |

Kanonisk modellkarta: `docs/schemas/model-build-profiles.md` + `config/ai_models/manifest.json`.

---

## Stream + handoff (snabbreferens)

- `done` = versionen är finaliserad och sparad. Inte att preview är klar.
- Efter `done` kan servern skicka `preview-ready` eller `build-error`.
- `done.previewPending` = Fas 3 fortsätter direkt efter Fas 2.

---

## Snabblänkar till kod

- `src/lib/gen/`
- `src/lib/providers/own-engine/`
- `src/lib/models/catalog.ts`
- `config/ai_models/manifest.json`
- `docs/schemas/README.md`

OpenClaw/Sajtagenten ligger bredvid own-engine-pipen: `src/components/openclaw/`, `/api/openclaw/*`, `/avatar`, `/api/did/chat`. Inte en lane i builderns own-engine.
