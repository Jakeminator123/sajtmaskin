# Bugglista — del 3 (`3.txt`-uppföljning)

**Källa (idéer, inte rålogg):** extern granskning i `.j_to_agent/3.txt` — scaffolds/dossiers/artifacts, MCP vs produkt, orchestrator vs deep brief, sandbox-strategi, scripts-rester, Cursor-regler.

**Relation till spår:** **W4** (scripts/README/lab) är **stängt** enligt [`track-w4-scripts.md`](./track-w4-scripts.md). Den här listan är **övriga, typade** åtgärder som inte var mekaniska script-kryss.

**Konflikthygiene:** dokument under `docs/plans/…` only. Säker att arbeta **parallellt** med agenter som ändrar `src/**`, `.j_to_agent/structure_bugs_and_parralells/kritik/**`, eller orchestrator-run under `.cursor/orchestrator/run/**` — undvik samma commit som rör både denna fil och tunga kodvägar om ni batchar manuellt.

---

## Översikt

| ID | Typ | Kort beskrivning |
|----|-----|------------------|
| B3-01 | dokumentation | Enhetlig vardagsordlista: **scaffold** / **dossier** / **artifact** i terminologi + länkade arkitekturstycken |
| B3-02 | kod (modellval) | Frivillig **fas→modell**-differentiering (t.ex. billigare fas för verifier) — idag samma `OwnModelId` per tier för alla faser utom `fast`-specialfallet |
| B3-03 | dokumentation | En kort sida: **deep brief** (builder/prompt) vs **orchestrator-run** (`.cursor/orchestrator`, Cursor-arbetsflöde) |
| B3-04 | dokumentation (arkitektur) | Sandbox/preview: **ephemeral** som norm, separat host för långlivade tjänster — sammanfoga med befintlig preview-/sandbox-doc |
| B3-05 | hygien (scripts) | När monolit-/fallback-prompten fasas ut: **arkivera eller ta bort** `scripts/extract-static-core.mjs` |
| B3-06 | hygien (repo-struktur) | Överväg flytt av `scripts/scaffold-pipeline.py` till t.ex. `devtools/` eller `scripts/manual/` om den stör upptäckbarhet (idag dokumenterad som avancerad, ej `package.json`) |
| B3-07 | Cursor / IDE | Verifiera att **vercel-react-best-practices** finns där `.cursor/rules/react-node-skill-routing.mdc` förväntar (plugin vs projektlokal skill); justera regeltext om path saknas |
| B3-08 | dokumentation | Översikt: **runtime** vs **Cursor-agenter** vs **MCP** (repo-lokala servrar) — kan ligga i `docs/architecture/` eller utöka `.cursor/README.md` |

---

## Detaljer (checklista)

### B3-01 — Terminologi (dokumentation)

- [x] Uppdatera `.cursor/rules/terminology.mdc` (och vid behov `docs/architecture/*` som nämner v0-template / dossier / scaffold) så **tre ord** bär huvuddelen av meningen: runtime-start (**scaffold**), research om extern mall (**dossier**), genererad data för kod (**artifact**).
- **Verifiering:** ingen kodändring nödvändig; länk från README eller architecture index om det finns.

### B3-02 — Fas-routing (kod)

- **Läge idag:** `src/lib/models/phase-routing.ts` returnerar samma `baseModel` för alla `GenerationPhase` inom en tier (undantag: `fast` + `reason: fast-tier-no-downgrade`). Tester i `phase-routing.test.ts` låser det beteendet.
- [ ] Om produkt vill **sänka kostnad/latens**: inför verklig karta per fas (t.ex. mindre modell till `verifier`), uppdatera tester + eventuell SSE-meta/copy så användaren förstår skillnaden.
- **Risk:** beteendeförändring i builder — gör i egen PR, inte ihop med kritik-only commits.

### B3-03 — Deep brief vs orchestrator (dokumentation)

- [x] Kort avsnitt (1 sida) som säger: deep brief = **produktflöde** före generering; orchestrator = **multi-agent-protokoll** under `.cursor/orchestrator/`; `/orchestrator` och `/automation` behandlas som **alias** i repot.
- **Levererat:** `docs/contributing/agent-workflows.md` + länk i `orchestrator-workloads-external-review.md`, `.cursor/README.md`, `docs/README.md`.

### B3-04 — Sandbox-strategi (dokumentation)

- [x] Sammanfoga rekommendationen från granskningen (ephemeral preview, separat VM/container för inspector/crawler/cache) med befintlig preview-/sandbox-dokumentation under `docs/architecture/` — inga kodkrav i denna punkt.
- **Levererat:** `preview-and-sandbox-flow.md` § *Ephemeral preview vs långlivade stödtjänster* + länk från `agent-workflows.md`.

### B3-05 — `extract-static-core.mjs` (hygien)

- [ ] När `config/codegen-static-prompt.json` + fragment är **enda** sanning och monolit-fallback tagits bort: flytta skriptet till `docs/old/scripts/` eller ta bort + grep efter referenser.
- **Idag:** behandla som **legacy** i `scripts/README.md` (redan markerat där enligt W4).

### B3-06 — `scaffold-pipeline.py` (struktur)

- [ ] Endast om stök i `scripts/` kvarstår: flytt + uppdatera `scripts/README.md`, `scripts-scaffolds-inventory.md`, ev. `package.json` om någon npm-wrapper tillkommer.

### B3-07 — vercel-react-best-practices (Cursor)

- [x] Bekräfta var skillen laddas (Cursor plugin path vs `.cursor/skills/`). Uppdatera `react-node-skill-routing.mdc` om instruktionen och verkligheten divergerar.
- **Levererat:** Regeln säger nu att **projektlokal** `.cursor/skills/` är bra om den finns, men **Vercel-plugin / bundlad path** också räcker — kravet är att följa skill-innehållet.

### B3-08 — Runtime vs agents vs MCP (dokumentation)

- [x] En tabell eller bullet-karta: appens runtime, lokala MCP (`sajtmaskin-engine`, `sajtmaskin-scaffolds`, externa docs-MCP), samt orchestrator-only filer. Minskar förvirring för nya agenter.
- **Levererat:** `docs/contributing/agent-workflows.md` § Runtime vs MCP vs Cursor-only.

---

## Status (batch)

Uppdatera datum nedan när ni stänger ID:n i en merge.

| Datum | Stängda ID | Not |
|-------|------------|-----|
| 2026-03-25 | B3-04 | `preview-and-sandbox-flow.md` ephemeral vs stödtjänster; länk från `agent-workflows.md` |
| 2026-03-25 | B3-01, B3-03, B3-07, B3-08 | `agent-workflows.md`, `terminology.mdc` cheat sheet, `react-node-skill-routing.mdc`, länkar i README/workloads/structure-doc |
