# Active plans

Execution-ready material under denna mapp. **Statuskarta + arkivlista + livscykel:** [`../README.md`](../README.md) · [`../../architecture/documentation-lifecycle.md`](../../architecture/documentation-lifecycle.md).

## Vad betyder «100% klart» här?

| Spår | «Klart» betyder | Var sanningen lever |
|------|-----------------|---------------------|
| **External review remediation** | W1–W5 execution enligt `1.txt`–`3.txt` är levererad; **100%** = *remediation exit*, inte att alla produktönskemål är borta | [`external-review-remediation-progress.md`](./external-review-remediation-progress.md) + [`archived/external-review-execution/REMEDIATION-EXIT.md`](../archived/external-review-execution/REMEDIATION-EXIT.md) |
| **Kritik / K-rader** | Öppna punkter tills produkt stänger dem | [`kritik-consolidated-open-items.md`](./kritik-consolidated-open-items.md) |
| **Plan 17 (repo separation)** | **Endast** WS-1–WS-4 i kärnan; WS-5, WS-6 och deferred-städ är **inte** klara → filen ska **inte** arkiveras som «färdig» än | [`17-repo-separation-and-independence.md`](./17-repo-separation-and-independence.md) |

## `external-review-execution/` i `active/` (stub)

**Innehåll** (README, REMEDIATION-EXIT, MASTER-ROADMAP, CONTINUATION, tracks) ligger i [`../archived/external-review-execution/`](../archived/external-review-execution/). Under `active/external-review-execution/` finns bara en [**stub**](./external-review-execution/README.md) så gamla länkar till den sökvägen inte går sönder. **Orchestrator-körningar** själva ligger i `.cursor/orchestrator/archive/` (gitignorerad) + poster i `run-summaries.md`.

## En sida för «vad är kvar?»

[`REMAINING-WORK.md`](./REMAINING-WORK.md) + [`queue/KORFIL.md`](./queue/KORFIL.md) — **tre körpunkter** (kritik, plan 17, drift/e2e).

## Innehåll i `active/` (kort)

- **Styrning remediation:** `external-review-remediation-progress.md`, `orchestrator-workloads-external-review.md` (**stub** → arkiverad W1–W5-text), `orchestrator-handoff-sequential-stramning.md` (mall).
- **Genomfört spår + audit trail:** `archived/external-review-execution/*` + stub `external-review-execution/README.md`.
- **Parallell kritik:** `kritik-consolidated-open-items.md`, `kritik-derived-backlog.md`.
- **Second opinion / reviews:** `reviews/README.md` — färdiga granskningar flyttas till [`../archived/`](../archived/) (se t.ex. `orchestrator-followup-from-39fef25e.md`).
- **Separat arkitekturplan:** `17-repo-separation-and-independence.md` (WS-5/6 kvar).
