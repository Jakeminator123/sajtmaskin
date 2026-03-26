# Backlog — progress och «hur mycket som är kvar»

**Syfte:** En **spårbar** (git-committad) siffra/översikt som kompletterar [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md) och [`MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md). Uppdatera **datum** och tabellerna när en K-rad stängs, Plan 17-kryss bockas eller K-018-acceptans ändras.

**Senast uppdaterad:** 2026-03-26 — `docs/old` flyttad till `avklarat/2026-03-docs-old-archive/`.

---

## Målbild («status vi vill nå»)

- **Kritik:** K-007, K-009, K-018, K-019 är **`[x]`** med datum (eller **`N/A`** med skriftlig motivering i kritik-tabellen).
- **Plan 17:** WS-5 och deferred (WS-2/WS-4) är **bockade eller N/A** i [`../17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md); planen kan flyttas till `docs/plans/avklarat/` enligt livscykel.
- **K-018 (MASTER §2 acceptans):** alla acceptansrader relevanta för nuvarande fas är uppfyllda eller medvetet nedprioriterade i MASTER.

**Remediation W1–W5:** redan **100% execution-scope** — se [`../../avklarat/external-review-execution/REMEDIATION-EXIT.md`](../../avklarat/external-review-execution/REMEDIATION-EXIT.md). Denna dashboard mäter **produkt-/arkitekturbacklog efter exit**, inte W-spåren igen.

---

## Snabba räknare (kanoniska öppningar)

| Yta | Kvar (nu) | Kommentar |
|-----|-----------|-----------|
| **K-rader helt öppna** | **4** | K-007, K-009, K-018, K-019 — alla `[ ]` i kritik-tabellen |
| **Plan 17 öppna kryss (WS-2 deferred + WS-4 + WS-5)** | **8** | Räknat från [`../17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md) |
| **K-018 §2 acceptans (efter Fas 1-listan)** | **3** tydligt `[ ]` + 1 delvis | Se [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) §2 *Acceptans efter Fas 1* (UI-shim/runtime m.m.) |

---

## Grov «andel klart» (subjektiv, inte matematik)

| Spår | Bedömning | Notis |
|------|-----------|--------|
| **K-018** | Många **delmoment** levererade (env-merge, build-status, session store, shim-fallback-signaler) | Största återstoden: VM-återanvändning, Fas 3-adapters, produkt-UX shim↔runtime |
| **K-019** | Snapshot-kolumn + prepend + Agentlogg default | Kvar: merge-policy, ev. UI, ev. sync create |
| **K-007** | Strikt JSON-readiness i version | Kvar: produkt/policy för auto-fix m.m. |
| **K-009** | Odefinierad scope | Kräver beslut eller dokumenterad wontfix |
| **Plan 17 WS-5 / deferred** | `docs/old` **flyttad** till arkiv (se nedan); övrigt WS-5 kvar (JSON, research-policy) | Kvar: `.gitignore`-scan, `research/`, ENV (WS-4) |

**Plan 17 WS-5 — tidigare `docs/old`:** innehåll **2026-03-26** i [`../../avklarat/2026-03-docs-old-archive/`](../../avklarat/2026-03-docs-old-archive/) + [`INVENTORY-2026-03-26.md`](../../avklarat/2026-03-docs-old-archive/INVENTORY-2026-03-26.md). Rot [`docs/old/README.md`](../../../old/README.md) = pekare.

**Samlad helhetsbild:** tänk **«flera veckors fokus kvar»** om allt på K-018 ska ner i botten (jmf [`../NASTA-AGENT-PROMPT.md`](../NASTA-AGENT-PROMPT.md) tidsuppskattning), inte «några timmar».

---

## Koppling till orchestrator-run

Aktiv körning (lokal, cursorignored): `.cursor/orchestrator/run/2026-03-26-backlog-orchestrator/`.

- Samlad plan (kopia + detalj): `context/compiled-input/ALL-REMAINING-PLAN.md` i den mappen.
- När en workload **verifieras**: uppdatera denna fil + `kritik` / `MASTER` / Plan 17 enligt reglerna i [`../AGENT-HANDOFF-RESTERANDE.md`](../AGENT-HANDOFF-RESTERANDE.md).

---

## Historik (kort)

| Datum | Vad |
|-------|-----|
| 2026-03-26 | Första version: räknare + målbild + koppling orchestrator. |
| 2026-03-26 | Orchestrator workload **02-01:** inventering skapad; senare samma dag **flytt** till `docs/plans/avklarat/2026-03-docs-old-archive/`. |
