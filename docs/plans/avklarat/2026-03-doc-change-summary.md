# Sammanfattning av dokumentations- och planändringar (ungefär)

**Arkiverad kopia** (2026-03-26): tidigare `active/DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md` — [stub med pekare](../active/DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md).

**Syfte:** En **läsbar** översikt över *ungefär* vad som ändrats i plan-/hubb-dokument och närliggande struktur i en **senare fas** av projektet (mars 2026), så du slipper leta i git-historik utan ledtråd.

**Sanning i detalj:** `git log --oneline` — denna fil är **inte** en juridisk difflista.

---

## Teman (vad som hände, grovt)

| Tema | Vad |
|------|-----|
| **K-019 / orchestration** | Kod + migration för `engine_chats.orchestration_snapshot`, sanering, follow-up-kontinuitet; tester; arkivnotis `avklarat/2026-03-k019-orchestration-snapshot-phase1.md`; stub `queue/PLAN-K019-PROMPT-SNAPSHOT.md` |
| **Deploy readiness** | Strikt JSON-validering av `package.json` / `components.json` / `jsconfig.json` i versioner; block vid ogiltighet (K-007-delmoment) |
| **Plan 17 WS-6** | Produktbeslut arkiverat; hubbar uppdaterade |
| **`archived` → `avklarat`** | Mapp `docs/plans/archived/` bytt till `docs/plans/avklarat/`; länkar svepta i repo; `docs/plans/archived/README.md` som pekare; `.cursorignore` uppdaterad |
| **Handoff** | `AGENT-HANDOFF-RESTERANDE.md`, `NASTA-AGENT-PROMPT.md` (prompt + tidsuppskattning); `REMAINING-WORK.md` länkar |
| **Övrigt** | `docs/plans/README.md` (active-lista), `COMPLETION-ROADMAP` (K-räkning 4 öppna), kö-/reviews-README, `MASTER-ALLT-KVAR`, kritik, progress — i takt med ovan |

---

## Git-commits (exempel — senaste relevanta, kortform)

Kör lokalt för full lista: `git log --oneline -30`

| Commit (kort hash) | Innehåll (subject) |
|---------------------|---------------------|
| `fb4991d36` | docs: AGENT-HANDOFF-RESTERANDE — samlad lista över öppet arbete |
| `a10c384b7` | docs: rename plans/archived to avklarat; stub old path + update links |
| `d1b9202fe` | docs: archive K-019 fas 1 (orchestration snapshot) + stub och hub-länkar |
| `cc2eb72fb` | feat(K-019): orchestration_snapshot på engine_chats + follow-up kontinuitet |
| `4c12a3034` | feat(readiness): validera components.json + jsconfig.json (strikt JSON) |
| `747c7bcd4` | feat(readiness): block deploy när package.json är ogiltig JSON |
| `e8a058617` | chore: devtest-hygien + arkivera Plan 17 WS-6 |
| `dc9b238e3` | docs(plan17): WS-6 product decisions — keep D-ID, OpenClaw; Brave + Loopia optional |
| … | Äldre: remediation exit, REMAINING-WORK, external-review arkiv, orchestrator-followup, m.m. |

---

## Filer som ofta rörts (icke uttömmande)

- `docs/plans/active/*` — MASTER, kritik, REMAINING-WORK, 17-repo-separation, queue/PLAN-*, AGENT-HANDOFF-*, stub `active/DOKUMENTATION-ANDRINGAR-SAMMANFATTNING.md` + denna arkivfil
- `docs/plans/avklarat/*` — tidigare «arkiverade» planer
- `docs/plans/README.md`, `docs/architecture/documentation-lifecycle.md`, `agent-roadmap-and-handoff.md`
- `.cursorignore`, `.cursor/rules/*` (sökvägar till `avklarat`)
- `docs/README.md`, `e2e/README.md`, `docs/contributing/agent-workflows.md`

---

## Underhåll

När du gör en **stor** doc-strukturförändring: lägg en rad i § **Git-commits** eller uppdatera § **Tem** — eller skapa en ny datumssektion längst ned så nästa person ser tidslinje.
