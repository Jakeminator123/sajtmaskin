# OMTAG — koordinerad återställning efter Wave 2026-04-22

**Syfte:** ta ut repot ur "asymmetriskt städat + tre audit-vågor utan mätsticka"-läget genom 7 fokuserade uppdrag som kan köras parallellt där beroenden tillåter.

**Rollfördelning:**
- Du (Jake) startar agenterna i fas-ordning enligt grafen nedan.
- Varje agent läser **endast** sitt eget kördokument + dokumenten det hänvisar till. Rör **inte** filer som ägs av ett annat kördokument.
- Assistenten (jag) agerar granskare mellan faserna — godkänner eller skickar tillbaka.

---

## Exekveringsgraf

```
Fas 0 (parallell — starta alla fyra samtidigt)
├── 01-embedding-diagnos        (P0, ~30 min–2 h)
├── 02-eval-baseline            (P0, 3–4 h)
├── 04-env-flag-collapse        (P2, 2–3 h)
└── 07-static-core-type-imports (P2, 45 min)
              ↓  (alla fyra godkända innan fas 1)
Fas 1 (parallell — starta båda samtidigt)
├── 03-wave-split-heatspots     (P1, 1–2 dagar)
└── 05-scaffold-default-removal (P1, 3–5 h)
              ↓  (båda godkända innan fas 2)
Fas 2 (sekventiell)
└── 06-unified-status-eventbus  (P2, 1 dag)
```

**Varför denna ordning:**

| Fas | Logik |
|---|---|
| 0 | **Mätstickan måste finnas innan kvalitetsändringar** (02). Embedding-bortfallet (01) är den mest plausibla "varför sämre senaste dygnet"-kandidaten — fixa först. 04 och 07 är oberoende småjobb som kan göras parallellt utan att röra heta filer. |
| 1 | **Rotorsaksfixar** som kräver eval-baseline (02) för att mäta om de höjer eller sänker kvalitet. 03 och 05 rör olika filer → parallell-säkra. |
| 2 | **Konsolidering** (06) är stor och behöver repot i stabilt läge. Görs sist. |

---

## Filkonflikt-matris

Varje kördoc listar sina `owner_files` i frontmatter. Detta är den sammanfattande parallell-säkerhetstabellen:

| Doc | Rör kärnfiler | Säker parallell med |
|---|---|---|
| 01-embedding-diagnos | `src/lib/gen/scaffolds/matcher.ts`, `src/lib/gen/semantic-search/*`, `src/lib/gen/dossiers/select.ts` (read-only) | 02, 04, 07 |
| 02-eval-baseline | `evals/**` (ny mapp), `scripts/evals/*` (ny) | 01, 03, 04, 05, 07 |
| 03-wave-split-heatspots | `src/lib/gen/system-prompt.ts`, `src/lib/gen/build-spec.ts`, `src/lib/builder/promptAssist.ts`, `src/lib/gen/stream/finalize-version.ts` | 02, 04, 05 *(olika filer)*, 07 |
| 04-env-flag-collapse | `src/lib/env.ts`, `config/env-policy.json`, `docs/ENV.md` | 01, 02, 03, 05, 07 |
| 05-scaffold-default-removal | `src/lib/gen/scaffolds/serialize.ts`, `src/lib/gen/stream/finalize-merge.ts`, `src/lib/gen/scaffolds/*` (defaults) | 02, 03, 04, 07 |
| 06-unified-status-eventbus | `src/lib/gen/stream/*`, `src/lib/logging/*`, `src/components/builder/preview-panel/*` | (körs ensam i fas 2) |
| 07-static-core-type-imports | `config/prompt-core/02-component-contract.md`, `config/prompt-core/00-core-contract.md` | 01, 02, 03, 04, 05 |

---

## Per-agent-workflow

1. Skapa branch `omtag/NN-kort-slug` från dagens master.
2. Läs *bara* ditt eget kördokument + inputs det hänvisar till. Rör inte filer utanför `owner_files`.
3. Följ stegen i dokumentet. Om du behöver gå utanför scope → stoppa och rapportera.
4. Kör `npm run typecheck`, `npm run lint`, `npx vitest run` (plus doc-specifika checks).
5. När klart: pusha branchen, rapportera till Jake med:
   - Branch-namn
   - Diff-sammanfattning (filer + LOC)
   - Resultat av acceptance-criteria-listan
6. Gör **inga PRs** mot GitHub (enligt `.cursor/rules/git.mdc`). Merge görs efter granskning.

---

## Granskarprotokoll (min roll)

Efter varje fas kontrollerar jag per-doc:

| Check | Hur |
|---|---|
| Scope hållen | `git diff --stat master...omtag/NN-*` — alla filer inom `owner_files`? |
| Ingen lager-multiplikation | Har kördoc lagt till nya guards/resolvers/fixers utan att ta bort något? Om ja → reject. |
| Acceptance-criteria uppfyllda | Följ listan i slutet av varje kördoc. |
| Docs-sync | Om det rörs pipeline-kod: uppdaterad `docs/architecture/glossary.md` + strict schemas? |
| Eval-baseline inte regresserad | När 02 är klar: kör den på PR-branchen innan merge. Tappar den >10 % på någon canonical prompt → reject. |

Reject-format: kort lista `[fil]:[rad] — [vad saknas/övertramp]`.

---

## Status-tabell (fyll i under körningen)

| Doc | Branch | Status | Startad | Klar | Mergad |
|---|---|---|---|---|---|
| 01-embedding-diagnos | | pending | | | |
| 02-eval-baseline | | pending | | | |
| 03-wave-split-heatspots | | pending | | | |
| 04-env-flag-collapse | | pending | | | |
| 05-scaffold-default-removal | | pending | | | |
| 06-unified-status-eventbus | | pending | | | |
| 07-static-core-type-imports | | pending | | | |

---

## När alla är mergade

1. Skriv `OMTAG/STATUS.md` med before/after eval-baseline.
2. Flytta kördokumenten till `docs/plans/avklarat/omtag-2026-04-23/` och uppdatera `docs/plans/README.md`.
3. Uppdatera repo-bedömning i en ny `STATUS-2026-04-XX.md` i roten.
