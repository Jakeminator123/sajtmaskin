# Körfil — post-remediation (endast öppet arbete)

**Syfte:** En **enda ingång** för agenter/orchestrator: allt som **medvetet återstår** efter external-review **remediation exit** och som fortfarande ska göras i det här repot — samlat i **tre körbara planfiler** nedan.

**Regel:** När en punkt är klar → uppdatera **källfilen** (tabellen i [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md), kryss i [`17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md), m.m.) och stryk eller markera avsnitt i respektive `PLAN-*.md`.

**Skapad:** 2026-03-25 (`orchestrator-run` — konsolidering av kvarvarande backlog).

**Hur mycket återstår?** Remediation **W1–W5 ≈ 100 %**. Efter det: **4 K-rader** + **12 öppna plan-17-kryss** — få punkter men **hög vikt** (produkt + arkitektur). Det går inte att «köra allt» utan dina beslut i [`COMPLETION-ROADMAP.md`](./COMPLETION-ROADMAP.md) § *Fas A*.

---

## Körordning (3 planer = 3 punkter)

1. **Kritik / produkt–kod** — öppna **K-007, K-008, K-009, K-014** + konfliktzon (integration/deploy). Kör enligt [`PLAN-KRITIK-OPEN.md`](./PLAN-KRITIK-OPEN.md); kanonisk tabell: [`kritik-consolidated-open-items.md`](../kritik-consolidated-open-items.md).

2. **Repo separation / plan 17** — **WS-5**, **WS-6**, **deferred** (v0 SDK/env, gateway-env-rester, `ENV.md` / `env-policy`). Kör enligt [`PLAN-REPO-SEPARATION-OPEN.md`](./PLAN-REPO-SEPARATION-OPEN.md); kanonisk plan: [`17-repo-separation-and-independence.md`](../17-repo-separation-and-independence.md).

3. **Drift, verifiering, dokumentation** — valfri deploy-smoke, segment-% / progress-hygien, löpande synk. Kör enligt [`PLAN-DRIFT-VERIFICATION.md`](./PLAN-DRIFT-VERIFICATION.md); se även [`e2e/README.md`](../../../../e2e/README.md) och [`external-review-remediation-progress.md`](../external-review-remediation-progress.md).

---

## Relaterade pekare (ej egna körfiler)

| Fil | Roll |
|-----|------|
| [`REMAINING-WORK.md`](../REMAINING-WORK.md) | Kort hubb — pekar hit som **operativ kö** |
| [`kritik-derived-backlog.md`](../kritik-derived-backlog.md) | Stub/pekare till konsoliderad kritik + denna kö |
| [`archived/external-review-execution/REMEDIATION-EXIT.md`](../../archived/external-review-execution/REMEDIATION-EXIT.md) | Fryst scope: W1–W5 **klart** |
