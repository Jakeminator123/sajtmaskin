# Active plans

Execution-ready material under denna mapp. **Statuskarta + arkivlista + livscykel:** [`../README.md`](../README.md) · [`../../architecture/documentation-lifecycle.md`](../../architecture/documentation-lifecycle.md). **Primär körplan:** [`SAJTMASKIN-EXECUTION-PLAN.md`](./SAJTMASKIN-EXECUTION-PLAN.md). **Arkiverad handoff-historik:** [`../avklarat/2026-03-handoff-doc-bundle/`](../avklarat/2026-03-handoff-doc-bundle/).

## Vad betyder «100% klart» här?

| Spår | «Klart» betyder | Var sanningen lever |
|------|-----------------|---------------------|
| **External review remediation** | W1–W5 execution enligt `1.txt`–`3.txt` är levererad; **100%** = *remediation exit*, inte att alla produktönskemål är borta | [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) + [`avklarat/external-review-execution/REMEDIATION-EXIT.md`](../avklarat/external-review-execution/REMEDIATION-EXIT.md) |
| **Kritik / K-rader** | Öppna punkter tills produkt stänger dem | [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) |
| **Plan 17 (repo separation)** | **WS-6 klar** (2026-03-26). **Kvar:** WS-5 + deferred (WS-2/WS-4) — huvudfilen arkiveras inte som «färdig» förrän de är gjorda eller N/A med motivering | [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) |

## `external-review-execution/` i `active/` (stub)

**Innehåll** (README, REMEDIATION-EXIT, MASTER-ROADMAP, CONTINUATION, tracks) ligger i [`../avklarat/external-review-execution/`](../avklarat/external-review-execution/). Under `active/external-review-execution/` finns bara en [**stub**](./external-review-execution/README.md) så gamla länkar till den sökvägen inte går sönder. **Orchestrator-körningar** själva ligger i `.cursor/orchestrator/archive/` (gitignorerad) + poster i `run-summaries.md`.

## En sida för «vad är kvar?»

[`SAJTMASKIN-EXECUTION-PLAN.md`](./SAJTMASKIN-EXECUTION-PLAN.md) + [`MASTER-ALLT-KVAR.md`](./MASTER-ALLT-KVAR.md) — körplan respektive djup referens; hubb [`REMAINING-WORK.md`](./REMAINING-WORK.md); [`INPUT_GPT.txt`](../../../INPUT_GPT.txt); `queue/KORFIL.md` = pekare till MASTER.

## Innehåll i `active/` (kort)

- **Styrning remediation:** `external-review-remediation-progress.md`, `orchestrator-workloads-external-review.md` (**stub** → arkiverad W1–W5-text); orchestrator-handoff-mall i [`../avklarat/2026-03-handoff-doc-bundle/`](../avklarat/2026-03-handoff-doc-bundle/).
- **Genomfört spår + audit trail:** `avklarat/external-review-execution/*` + stub `external-review-execution/README.md`.
- **Parallell kritik:** `kritik-consolidated-open-items.md`, `kritik-derived-backlog.md`.
- **Second opinion / reviews:** `reviews/README.md` — färdiga granskningar flyttas till [`../avklarat/`](../avklarat/) (se t.ex. `orchestrator-followup-from-39fef25e.md`).
- **Separat arkitekturplan:** `17-repo-separation-and-independence.md` (WS-5/6 kvar).
