# Active plans

Execution-ready material under denna mapp. **Statuskarta + arkivlista + livscykel:** [`../README.md`](../README.md) · [`../../architecture/documentation-lifecycle.md`](../../architecture/documentation-lifecycle.md).

## Vad betyder «100% klart» här?

| Spår | «Klart» betyder | Var sanningen lever |
|------|-----------------|---------------------|
| **External review remediation** | W1–W5 execution enligt `1.txt`–`3.txt` är levererad; **100%** = *remediation exit*, inte att alla produktönskemål är borta | [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) + [`external-review-execution/REMEDIATION-EXIT.md`](./external-review-execution/REMEDIATION-EXIT.md) |
| **Kritik / K-rader** | Öppna punkter tills produkt stänger dem | [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) |
| **Plan 17 (repo separation)** | **Endast** WS-1–WS-4 i kärnan; WS-5, WS-6 och deferred-städ är **inte** klara → filen ska **inte** arkiveras som «färdig» än | [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) |

## Varför ligger `external-review-execution/` kvar i `active/`?

Mappen är **logiskt färdig** som kör-spår men ligger kvar här av **länkstabilitet** (progress, `docs/README.md`, Cursor-regler, `KRITIK-OVERVIEW`, m.fl. pekar hit). Flytt till `archived/` skulle kräva massuppdatering av sökvägar utan stor vinst. **Orchestrator-körningar** själva ligger i `.cursor/orchestrator/archive/` (gitignorerad) + poster i `run-summaries.md`.

## Innehåll i `active/` (kort)

- **Styrning remediation:** `external-review-remediation-progress.md`, `orchestrator-workloads-external-review.md`, `orchestrator-handoff-sequential-stramning.md` (mall).
- **Genomfört spår + audit trail:** `external-review-execution/*` (README, CONTINUATION, MASTER-ROADMAP, track-filer, REMEDIATION-EXIT, buglista del 3).
- **Parallell kritik:** `kritik-consolidated-open-items.md`, `kritik-derived-backlog.md`.
- **Second opinion / reviews:** `reviews/README.md` — färdiga granskningar flyttas till [`../archived/`](../archived/) (se t.ex. `orchestrator-followup-from-39fef25e.md`).
- **Separat arkitekturplan:** `17-repo-separation-and-independence.md` (WS-5/6 kvar).
