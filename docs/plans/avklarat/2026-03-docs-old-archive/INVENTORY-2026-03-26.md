# Inventering — tidigare `docs/old/` (flyttad till arkiv) (2026-03-26)

**Syfte:** Plan 17 WS-5 — inventering före flytt. **Flytt genomförd 2026-03-26** till denna mapp.

**Metod:** Rekursiv fillista från repo root; kategorisering och rekommendation är **manuell bedömning** (konservativ: default **keep**).

---

## Sammanfattning

| Kategori | Antal filer |
|----------|-------------|
| Rot + README | 1 |
| `2026-03-holding-area/` | 4 |
| `analyses/` | 14 |
| `schemas/` | 1 |
| `transcripts/` | 3 |
| **Totalt** | **23** |

---

## Filer (sorterade)

| Sökväg | Typ | Rekommendation | Motivering |
|--------|-----|----------------|------------|
| `docs/plans/avklarat/2026-03-docs-old-archive/README.md` | index | **keep** | Beskriver syfte med `docs/plans/avklarat/2026-03-docs-old-archive/`; behåll tills mappen töms eller omstruktureras. |
| `docs/plans/avklarat/2026-03-docs-old-archive/2026-03-holding-area/README.md` | index | **keep** | Kontext för holding-area; bra vid städ-PR. |
| `docs/plans/avklarat/2026-03-docs-old-archive/2026-03-holding-area/next-sidan-skrapning.txt` | rå anteckning | **keep** | Historisk research/skrap; kan flyttas till arkiv-repo senare — inte radera utan läsning. |
| `docs/plans/avklarat/2026-03-docs-old-archive/2026-03-holding-area/sajtmaskin-sammanfattning.txt` | sammanfattning | **keep** | Samma som ovan. |
| `docs/plans/avklarat/2026-03-docs-old-archive/2026-03-holding-area/sammanfattning-openclaw-wsl.txt` | anteckning | **keep** | OpenClaw/WSL-kontext; kan vara referens för support. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-14-builder-version-audit.md` | analys | **keep** | Byggare/version-audit; användbar vid regression eller audit-uppföljning. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-15-autofix-loop-diagnosis.md` | diagnos | **keep** | Autofix-loop — referens vid liknande buggar. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-15-embeddings-rag-scaffolds-ignore-report.md` | rapport | **keep** | Embeddings/RAG/scaffold — kopplat till research-spår. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-branch-assessment.md` | assessment | **keep** | Gren-/repo-bedömning. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-deep-research-buggar-overlapp.md` | research | **keep** | Bug-overlap research. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-smb-orchestration-notes/README.md` | index | **keep** | SMB/orchestration anteckningsmapp. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-smb-orchestration-notes/modellval.txt` | anteckning | **keep** | Modellval — historik. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-smb-orchestration-notes/promptforstaelse.txt` | anteckning | **keep** | Promptförståelse — historik. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-smb-orchestration-notes/sajtmaskin-prompt-orkestrering.md` | designanteckning | **keep** | Orkestrering — kan påverka framtida K-019-arbete. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/2026-03-smb-orchestration-notes/stortest-gpt-utvardering.txt` | testlogg | **keep** | Utvärdering — referens. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/bug-recheck-sweep-ledger.md` | ledger | **keep** | Bug sweep — användbar som spårbarhet. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/buildmotor-slutrapport.md` | rapport | **keep** | Byggmotor slutrapport. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/phase-08-plan-persistence-and-orchestration.md` | plan | **keep** | Fas 8 persistence/orchestration. |
| `docs/plans/avklarat/2026-03-docs-old-archive/analyses/phase-09-smb-growth-implementation-status.md` | status | **keep** | Fas 9 implementation status. |
| `docs/plans/avklarat/2026-03-docs-old-archive/schemas/README.md` | index | **keep** | Gammal schema-pekare; verifiera mot `docs/schemas/` innan ev. borttagning i separat PR. |
| `docs/plans/avklarat/2026-03-docs-old-archive/transcripts/README.md` | index | **keep** | Transkriptmapp — beskrivning. |
| `docs/plans/avklarat/2026-03-docs-old-archive/transcripts/logg-chatt.txt` | logg | **keep** | Chattlogg — kan innehålla känslig info; **inte** radera blind; ev. flytta till gitignored arkiv om policy kräver. |
| `docs/plans/avklarat/2026-03-docs-old-archive/transcripts/test-run-output.txt` | logg | **keep** | Test output — referens. |

---

## Nästa steg (ej utförda här)

1. **Separat PR:** välj en delmängd efter manuell läsning; inga **candidate delete** i denna runda (allt *keep* tills duplicering mot `docs/plans/active/` är bedömd).
2. Uppdatera Plan 17 WS-5-kryss först när städ-PR är mergad och kryss sätts i `docs/plans/active/17-repo-separation-and-independence.md`.
3. `docs/plans/active/queue/BACKLOG-PROGRESS-DASHBOARD.md` — historikrad för inventering 2026-03-26.

---

## Verifiering

Lista genererad med: `Get-ChildItem docs/old -Recurse -File` före flytt (23 filer); därefter `git mv` till arkiv.


