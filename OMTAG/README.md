# OMTAG — koordinerad återställning efter Wave 2026-04-22

**Syfte:** ta ut repot ur "asymmetriskt städat + tre audit-vågor utan mätsticka"-läget genom fokuserade uppdrag som kan köras parallellt där beroenden tillåter. Fas 0+1+3 = **strukturell grund**. Fas 2 (från guldrapporten 2026-04-23) = **semantisk konsolidering** ovanpå den grunden.

**Rollfördelning:**
- Du (Jake) startar agenterna i fas-ordning enligt grafen nedan. Varje agent kör i egen worktree eller lokalt på egen branch.
- Varje agent läser **endast** sitt eget kördokument + dokumenten det hänvisar till. Rör **inte** filer som ägs av ett annat kördokument.
- Assistenten (jag) agerar granskare mellan faserna — godkänner eller skickar tillbaka.

**Parkerat (explicit — läs innan du startar nästa agent):** se [`PARKED.md`](./PARKED.md). L1, L2, L3, M2, P32 Fas B–F, M3, P33, WebContainers — inga agenter får starta på dessa utan klartecken.

---

## Exekveringsgraf

```
Fas 0 (parallell — alla fyra samtidigt)              Fas 2·D kan starta
├── 01-embedding-diagnos        (P0, ~30 min–2 h)    parallellt med
├── 02-eval-baseline            (P0, 3–4 h)          fas 0 — rör inga
├── 04-env-flag-collapse        (P2, 2–3 h)          OMTAG-ägda filer:
└── 07-static-core-type-imports (P2, 45 min)    ═══ ▶ fas2/D-dossier-contract
              ↓  (alla fyra godkända)                       │
                                                            │
Fas 1 (parallell)                                           │
├── 03-wave-split-heatspots     (P1, 1–2 dagar)             │
└── 05-scaffold-default-removal (P1, 3–5 h)                 │
              ↓  (båda godkända)                            ↓
                                                      (körs klart
Fas 2 (guldrapport 2026-04-23 — semantisk konsolidering)  när som helst
                                                       innan Fas 3)
├── fas2/A-follow-up-integrity     (P1, 1–1,5 dag)
│         (kräver 03 landad)
├── fas2/B-scaffold-variant-cleanup (P2, 1 dag)
│         (kräver 05 landad)
└── fas2/C-autofix-import-hardening (P2, 1–1,5 dag)
          (kräver 02 + 03 landade)
              ↓  (alla fas 2 godkända)

Fas 3 (konsolidering)
└── 06-unified-status-eventbus  (P2, 1 dag)
          (sist — kräver stabil grund)
```

**Kör-ordning i praktiken (guldrapportens logik):**

1. Fas 0 parallellt (pågår 2026-04-23 kväll)
2. Fas 2·D parallellt (start när som helst — helt konfliktfri)
3. Fas 1 parallellt (när fas 0 grön)
4. Fas 2·A parallellt med fas 2·C när 03 landad
5. Fas 2·B sist i fas 2 när 05 landad
6. Fas 3 (06 event-bus) när allt ovan stabilt

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
| 01-embedding-diagnos | `src/lib/gen/scaffolds/matcher.ts`, `src/lib/gen/semantic-search/*`, `src/lib/gen/dossiers/select.ts` (read-only) | 02, 04, 07, fas2·D |
| 02-eval-baseline | `evals/**` (ny mapp), `scripts/evals/*` (ny) | 01, 03, 04, 05, 07, fas2·D |
| 03-wave-split-heatspots | `src/lib/gen/system-prompt.ts`, `src/lib/gen/build-spec.ts`, `src/lib/builder/promptAssist.ts`, `src/lib/gen/stream/finalize-version.ts` | 02, 04, 05 *(olika filer)*, 07, fas2·D |
| 04-env-flag-collapse | `src/lib/env.ts`, `config/env-policy.json`, `docs/ENV.md` | 01, 02, 03, 05, 07, fas2·D |
| 05-scaffold-default-removal | `src/lib/gen/scaffolds/serialize.ts`, `src/lib/gen/stream/finalize-merge.ts`, `src/lib/gen/scaffolds/*` (defaults) | 02, 03, 04, 07, fas2·D |
| 06-unified-status-eventbus | `src/lib/gen/stream/*`, `src/lib/logging/*`, `src/components/builder/preview-panel/*` | (körs ensam i fas 3) |
| 07-static-core-type-imports | `config/prompt-core/02-component-contract.md`, `config/prompt-core/00-core-contract.md` | 01, 02, 03, 04, 05, fas2·D |
| **fas2/A-follow-up-integrity** | `src/lib/gen/follow-up-predicate.ts` (ny), `orchestrate.ts`, `chat-message-stream-post.ts`, `finalize-merge.ts`, `system-prompt/`, builder-UI | fas2·D *(olika filer)* |
| **fas2/B-scaffold-variant-cleanup** | `src/lib/gen/scaffolds/registry.ts`, `content-site/**`, `landing-page/**`, `scaffold-variants/**` | fas2·D *(olika filer)* |
| **fas2/C-autofix-import-hardening** | `src/lib/gen/autofix/rules/**`, `system-prompt/` (E4-sektion), `manifest.json` (M4), `scripts/dev/` (E6) | fas2·D *(olika filer)* |
| **fas2/D-dossier-contract** | `src/lib/gen/dossiers/validate-manifest.ts` (ny), `registry.ts`, `scripts/dossiers/**`, `backoffice/pages/dossiers.py`, `package.json` | **ALLA andra** — frikopplad |

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

| Doc | Branch | Worktree | Status | Startad | Klar | Mergad |
|---|---|---|---|---|---|---|
| 01-embedding-diagnos | `omtag/01-embedding-diagnos` | main (lokalt) | in-progress | 2026-04-23 | | |
| 02-eval-baseline | `omtag/02-eval-baseline` | `~/.cursor/worktrees/sajtmaskin/y0v0` | in-progress | 2026-04-23 | | |
| 04-env-flag-collapse | `omtag/04-env-flag-collapse` | `~/.cursor/worktrees/sajtmaskin/ry8p` | in-progress | 2026-04-23 | | |
| 07-static-core-type-imports | | | pending | | | |
| 03-wave-split-heatspots | | | pending (fas 1) | | | |
| 05-scaffold-default-removal | | | pending (fas 1) | | | |
| **fas2/D-dossier-contract** | | | pending (kan starta nu) | | | |
| **fas2/A-follow-up-integrity** | | | pending (efter 03) | | | |
| **fas2/B-scaffold-variant-cleanup** | | | pending (efter 05) | | | |
| **fas2/C-autofix-import-hardening** | | | pending (efter 02+03) | | | |
| 06-unified-status-eventbus | | | pending (fas 3) | | | |

---

## När alla är mergade

1. Skriv `OMTAG/STATUS.md` med before/after eval-baseline.
2. Flytta kördokumenten till `docs/plans/avklarat/omtag-2026-04-23/` och uppdatera `docs/plans/README.md`.
3. Uppdatera repo-bedömning i en ny `STATUS-2026-04-XX.md` i roten.
