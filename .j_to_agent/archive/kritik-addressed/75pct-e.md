# Parallell granskning — ~75% whole vision, W4 exit (`59e488ae`)

**Commit:** `59e488ae` — `chore: remediation ~75pct — remove hamta_sidor.py, move lab to scripts/labs/testning_scarf`  
**Sanning i repo:** `docs/plans/active/external-review-remediation-progress.md` (~75% whole, scripts/W4 ~75%, track W4 **klar**).

**Föregående snapshot:** `72pct-w.md` (öppen punkt: `testning_scarf`-flytt) → **stängd** av denna commit; filen arkiverad under `../../archive/kritik-addressed/`.

---

## 1. Leverantörsbeskrivning vs spot-check

### Hamta / Python-ingång

| Påstående | Status |
|-----------|--------|
| `scripts/hamta_sidor.py` borttagen; en kanon: `hamta_sidor_branch_emil.py` + `--legacy-wide-use-cases` för bred lista | **Stämmer** (`Test-Path scripts/hamta_sidor.py` → false i verifieringskörning) |

### Lab-flytt (`72pct-w` handoff)

| Påstående | Status |
|-----------|--------|
| `testning_scarf` under `scripts/labs/testning_scarf/` | **Stämmer** (katalog finns) |
| `package.json`-scripts pekar på `scripts/labs/testning_scarf/…` (`prompt:trace`, `scaffold:suite`, `first-llm:*`, `testning:codegen-print`) | **Stämmer** (grep) |
| Uppdateringar av ignore-filer, `REPO_ROOT` i labb-skript (per commit body) | **Ej rad-för-rad** här; följ `git show 59e488ae` vid behov |

### Dokumentation / spår

| Påstående | Status |
|-----------|--------|
| Progress, `track-w4-scripts.md`, `MASTER-ROADMAP`, orchestrator-log, README/inventory/research enligt commit | **Stämmer** (`git show --stat`) |

---

## 2. Egen verifiering (denna session)

| Kommando | Resultat |
|----------|----------|
| `npm run typecheck` | **OK** |
| `npx vitest run` | **OK** — **345** tester, **79** filer |

---

## 3. Kvar i helhetsbilden (progress *Återstår*)

- Valfri **W2** deploy-hårdning (färre auto-fix / valideringsfas före deploy).
- Lösare uppföljning **utanför track** (W4 scripts enligt track **klar**).

---

## 4. Observation

Samma mönster som tidigare: **~75%** används både för *whole vision* och *landnings-spåret* i samma stycke — ofarligt om siffrorna medvetet sammanfaller; annars förtydliga i progress vid nästa redaktion.

---

## 5. Handoff

Nästa milstolpe: uppdatera `external-review-remediation-progress.md` + ev. ny `NNpct-*.md` när **~80%** eller annat tydligt batch-mål är levererat. Flytta denna fil till `../../archive/kritik-addressed/` när den ersatts.

---

*Fil: `75pct-e.md` — **e** = W4 exit / hamta+lab slice verifierad mot `59e488ae`.*
