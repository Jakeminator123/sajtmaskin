# LLM-pipeline: milstolpe på GitHub + review-uppföljning (kördokument)

**Arkiv:** ligger under `docs/plans/avklarat/` (review-spår **stängt** 2026-03-30). Operativ backlog: [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md).

**Status — Del B (review-uppföljning):** **Stängd** (2026-03-30). Alla rader B1–B4 i tabellen nedan är levererade. Detta dokument behålls som **referens** för milstolpe-tag (Del A), rollback och vad som gjordes i Del B.

**Syfte:** Säkerställa en **återgångspunkt** på GitHub för den version som extern review bedömt som **rätt riktning**, och sedan — i **tydlig ordning** — åtgärda kvarvarande skärpa från samma review.

**Review-sammanfattning:** Baseline (t.ex. commit `59820639b`) är **inte** ett steg bort från “world-class”; den **förtydligar kontrakt** (prompt, merge, pipeline-ordning) och **delar upp** stream-kod. Revert är bara motiverat vid **reproducerbar regression** (t.ex. `git bisect`), inte på grund av reviewens ton.

---

## Del A — Milstolpe (gör först, en gång per baseline)

Taggen ska peka på **exakt den commit** du vill frysa **innan** du börjar på Del B (eller på samma commit om du redan committat kördokumentet separat — se nedan).

### A1. Kontrollera ren working tree

```powershell
cd C:\Users\jakem\dev\projects\sajtmaskin
git status -sb
```

Inga oväntade ändringar innan du taggar (annars commit eller stash).

### A2. Skapa annoterad tag

Exempel (ersätt med din faktiska fulla hash om du taggar manuellt):

```powershell
git tag -a milestone/llm-pipeline-baseline-59820639 -m "Baseline: LLM pipeline consolidation; rollback before review follow-ups."
```

### A3. Pusha taggen till GitHub

```powershell
git push origin milestone/llm-pipeline-baseline-59820639
```

### A4. Återgå till milstolpen vid behov

Ny branch från taggen:

```powershell
git fetch origin tag milestone/llm-pipeline-baseline-59820639
git switch -c hotfix/from-llm-baseline milestone/llm-pipeline-baseline-59820639
```

Eller bara checkout (detached HEAD) för snabb jämförelse:

```powershell
git checkout milestone/llm-pipeline-baseline-59820639
```

**Lista taggar:** `git tag -l "milestone/*"`

---

## Del B — Review-uppföljning (efter milstolpe, i prioritetsordning)

Checka av raderna när de är klara. Efter varje batch: `npm run typecheck` och `npm run test:ci` (eller `npx vitest run` mot berörda tester).

| # | Åtgärd | Varför | Var i kod / docs | Verifiering |
|---|--------|--------|------------------|-------------|
| **B1** | **`_lastMaterializedUrls` per körning** — sätt alltid från senaste `materializeImages()`-resultat (även vid 0 byten); vid fel i blocket, nollställ t.ex. `new Set()`. | Undviker att validering hoppar över gamla URL:er från föregående generation. | `src/lib/gen/stream/finalize-version.ts` | **Klart** i första uppföljningscommit efter milstolpe-taggen. Verifiera: `npm run test:ci`. |
| **B2** | **En fas-vokabulär** — låt `OwnEnginePostStreamPhaseId` från `finalize-pipeline-contract.ts` styra `onProgress`-steg (eller mappa 1:1 i ett enda lager) så UI/telemetri inte har tre parallella namn (`validation` vs `validate_syntax`). | Review: minskar förvirring när UI kopplas till pipeline. | `finalize-version.ts`, `stream-handlers.ts`, ev. `builder-stream-contract.ts` | **Klart** 2026-03-30 — SSE `progress.step` = pipeline `id`; svenska etiketter från `labelSv` / `stream-handlers`. |
| **B3** | **Integration-SSE och typkontrakt** — antingen emittera payload som matchar `BuilderIntegrationPayload`, eller uppdatera typen till `{ items: [...] }` m.m. och dokumentera. | Kontrakt ska spegla verkligheten, inte bara `coerce` på klienten. | `generation-stream-tools.ts`, `builder-stream-contract.ts`, `stream-handlers.ts` | **Klart** 2026-03-30 — `BuilderIntegrationEnvelope` + typade emissions; `coerceIntegrationSignals` kvar för tolerans. |
| **B4** | **`done` före `sandbox-ready`** är **avsiktligt** — dokumentera i kanonisk arkitektur att fler events kan komma efter `done`. | Förhindrar att någon “stänger” lyssnaren vid `done` och bryter sandbox. | `docs/architecture/builder-generation.md` (+ ev. `builder-stream-contract.ts` kommentar) | Läsning: ny utvecklare förstår livscykeln. |

### Rekommenderad arbetsordning

1. **B1** — liten, hög korrekthetsvinst (ofta en commit).
2. **B4** — ren dokumentation, låg risk.
3. **B2** — större refaktor; gärna egen PR med UI-smoke.
4. **B3** — efter B2 eller parallellt om ni undviker konflikter i samma filer.

---

## Underhåll

Del B är stängd — se statusrutan överst. Fortsatt operativ backlog: [`../active/PROJECT-STATE-AND-DIRECTION.md`](../active/PROJECT-STATE-AND-DIRECTION.md). Post-epic-städ (historik): [`./POST-EPIC-CLEANUP.md`](./POST-EPIC-CLEANUP.md). Historisk konsoliderad plan: [`./CONSOLIDATED-own-engine-platform-and-quality-v2.md`](./CONSOLIDATED-own-engine-platform-and-quality-v2.md).

**Skapad:** 2026-03-30 · **Milstolpe-tag:** `milestone/llm-pipeline-baseline-59820639` (pekar på commit `59820639b` — *före* kördokument/B1/B4-commit på `master`).

**Efter push:** `master` innehåller även uppföljningscommit med detta dokument, `builder-generation`-livscykel och B1-fix. Återställ enbart kodbasen till milstolpen med taggen ovan; mergea sedan fram `master` när du vill ha fixarna.
