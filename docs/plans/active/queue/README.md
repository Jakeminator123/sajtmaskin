# Queue — endast öppet arbete (post exit)

## Varför massarkiveras inte «alla» filer hit trots MASTER + handoff?

**[`SAJTMASKIN-EXECUTION-PLAN.md`](../SAJTMASKIN-EXECUTION-PLAN.md)**, **[`MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md)** och (historik) **[`../../avklarat/2026-03-handoff-doc-bundle/`](../../avklarat/2026-03-handoff-doc-bundle/)** samlar **prioritering, tabeller och startinstruktioner**. De ersätter **inte** automatiskt:

- långa implementationsdetaljer (t.ex. **K-018** i [`PLAN-PREVIEW-SANDBOX.md`](./PLAN-PREVIEW-SANDBOX.md)),
- **FAQ** och begrepp ([`FRAGOR-SVAR-FAQ.md`](./FRAGOR-SVAR-FAQ.md)),
- **beslutsunderlag (arkiv):** [`../../avklarat/2026-03-handoff-doc-bundle/BESLUT-INNAN-VI-GAR-VIDARE.md`](../../avklarat/2026-03-handoff-doc-bundle/BESLUT-INNAN-VI-GAR-VIDARE.md),
- **tidslinje / faser (arkiv):** [`../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md`](../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md).

**Antal filer:** Under `queue/` finns **omkring elva** `.md`-filer (tabellen nedan + några till) — inte tjugo. Mappen **[`reviews/`](../reviews/)** innehåller i praktiken bara en **README** som pekar till redan **arkiverad** uppföljning i [`../../avklarat/orchestrator-followup-from-39fef25e.md`](../../avklarat/orchestrator-followup-from-39fef25e.md).

**Massflytt till `avklarat/`** utan annat skulle **bryta** många länkar i repot (MASTER § 8, kritik, `docs/README`, `e2e`, m.m.). Det som krävs är antingen **stubbar** i `active/queue/` (samma idé som `active/external-review-execution/`) **eller** en **medveten länk-uppdatering** i hela PR:et — se [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md) § *Arkivering, `reviews/`, `queue/`*.

---

**Start här:** [`../SAJTMASKIN-EXECUTION-PLAN.md`](../SAJTMASKIN-EXECUTION-PLAN.md) · djup referens [`../MASTER-ALLT-KVAR.md`](../MASTER-ALLT-KVAR.md)

**Äldre ingång:** [`KORFIL.md`](./KORFIL.md) pekar bara till MASTER.

**Valfria detaljplaner:**

| Plan | Fil |
|------|-----|
| Preview / sandbox / K-018 | [`PLAN-PREVIEW-SANDBOX.md`](./PLAN-PREVIEW-SANDBOX.md) |
| Kritik | [`PLAN-KRITIK-OPEN.md`](./PLAN-KRITIK-OPEN.md) |
| Plan 17 öppet | [`PLAN-REPO-SEPARATION-OPEN.md`](./PLAN-REPO-SEPARATION-OPEN.md) |
| K-019 (stub + arkiv) | [`PLAN-K019-PROMPT-SNAPSHOT.md`](./PLAN-K019-PROMPT-SNAPSHOT.md) |
| Drift | [`PLAN-DRIFT-VERIFICATION.md`](./PLAN-DRIFT-VERIFICATION.md) |

Handoff: [`INPUT_GPT.txt`](../../../../INPUT_GPT.txt)

**Tidslinje / faser (arkiv):** [`../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md`](../../avklarat/2026-03-handoff-doc-bundle/COMPLETION-ROADMAP.md) · **FAQ:** [`FRAGOR-SVAR-FAQ.md`](./FRAGOR-SVAR-FAQ.md)
