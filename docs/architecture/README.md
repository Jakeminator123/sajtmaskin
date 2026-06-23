# Arkitektur — översikt

**Senast uppdaterad:** 2026-06-23.

Ingångssida för arkitekturdokumentationen.

- **Kod är alltid source of truth.**
- Fasnamn (Fas 1 / Fas 2 / Fas 3) är kanoniska. "Steg 3/4/5" och "Fas 4" används inte längre.
- Dokumenthierarki vid konflikt: `docs/schemas/strict/*.schema.json` > `docs/schemas/*.md` > docs/architecture > backoffice (`sajtmaskin_backoffice.py`). Kod vinner fortfarande över alla docs.
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

## Kanonisk LLM-kedja

| Dokument | Fokus |
|---|---|
| [**llm-pipeline.md**](./llm-pipeline.md) | **Kanoniskt körflöde FAS 1→2→3** — prompt, brief, orkestrering, codegen, finalize/autofix/verifier, preview, quality-gate, deploy. Ersätter de tidigare separata `fas1/2/3`-filerna. |

Komplement:

| Dokument | Vad det täcker |
|---|---|
| [**llm-flow-target-worldclass.md**](./llm-flow-target-worldclass.md) | **Målbild** — vart LLM-flödet siktar (3-fasmodell, single repair gate, status event bus, init/follow-up som distinkta operationer). Använd som referens vid PR-review och triage. |
| [llm-callsite-matrix.md](./llm-callsite-matrix.md) | Fil:rad-index per LLM-anrop (modellkälla, deterministiska steg) |
| [llm-signal-flow.md](./llm-signal-flow.md) | Hur signallager samspelar + ägarmatris (canonical source per signal) |
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
| Deep Brief | Init-expansion via `/api/ai/brief`; separat från byggmodellen |
| Prompt assist / polish | Legacy-paraply. Rewrite/polish-knapparna är borttagna; kvarvarande aktiv yta är Deep Brief + fallback helpers i `prompt-assist/` |
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
