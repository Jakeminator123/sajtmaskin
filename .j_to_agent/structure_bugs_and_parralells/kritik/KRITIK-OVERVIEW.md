# Kritikfiler — typer och index (parallell granskning)

Den här mappen samlar **mänskligt och agent-stött** granskning **vid sidan av** orchestratorns remediation-commits. Syftet är att spåra vad som påståtts, vad som verifierats, och vad som **fortfarande** är öppet — så en **kontrollagent** (du eller annan agent) kan arbeta mot samma backlog.

---

## Typer av filer (mönster)

| Typ | Namnmönster | Innehåll |
|-----|-------------|----------|
| **Milstolpe / helhets-%** | `NNpct-<bokstav>.md` (t.ex. `18pct-k`, `42pct-v`, `43pct-r`) | Snapshot när *whole vision* ungefär **NN%** enligt `external-review-remediation-progress.md`: vad som levererats, risker, “missat”, rekommenderad nästa ordning. |
| **Avgränsat spår** | fritt namn, t.ex. `vercel-templates-path-verification-note.md` | En **tråd** som inte ska blandas med hela remediation (t.ex. gitignore vs `main`/`master`, script-sökvägar). |
| **Index / meta** | `KRITIK-OVERVIEW.md` (denna fil) | **Vad filerna betyder** + tabell över befintliga filer — minskar att nya agenter uppfinner om namngivning. |

**OBS:** Procentsiffrorna är **ungefärliga**; sanningskälla för “hur långt vi kommit” är alltid **`docs/plans/active/external-review-remediation-progress.md`** + `git log origin/master`.

---

## Befintliga filer (i repot)

| Fil | Ungefärlig koppling |
|-----|---------------------|
| `18pct-k.md` | Arkiverad sammanfattning: första landnings-remediering (~18pct). |
| `27pct-w.md` | Tier2/registry-scaffold-kedja (18pct → 27pct), arkiverad tabell. |
| `31pct-t.md` | Wire registry, hero/footer, extract-vakt (~31pct). |
| `34pct-n.md` | `LandingBackground` + reduced-motion scoped (~34pct). |
| `42pct-v.md` | W2 manifest + deploy readiness (`11f443db`). |
| `64pct-s.md` | Snapshot ~64% whole vision: plan-mode + transaktionell finalize + kritikarkiv (`16acd282`‑linjen). |
| `72pct-w.md` | ~72% whole, W4 hamta-wrapper + `--legacy-wide-use-cases` + docs (`d27c54b1`); öppen: `testning_scarf`-flytt. |
| `vercel-templates-path-verification-note.md` | Vercel scrape-sökväg, `main` vs `master`, agentpåståenden. |
| `KRITIK-OVERVIEW.md` | Denna fil — typregister + index över övriga kritikfiler. |

**Arkiv (åtgärdade snapshots):** [`../../archive/kritik-addressed/`](../../archive/kritik-addressed/README.md) — bl.a. `43pct-r.md`, `56pct-h.md` (se README där).

*(Lägg till fler aktiva `NNpct-*` i tabellen när de skapas; flytta hit när handoff är klar.)*

---

## Arbetsflöde för kontrollagent

1. `git fetch origin` → `git log origin/master -10 --oneline`
2. Läs **`external-review-remediation-progress.md`** (tabell + *Next* + *Uncertainties*)
3. Vid större steg: lägg **`NNpct-<bokstav>.md`** med verifiering mot diff / tester
4. Vid smal tråd: eget beskrivande namn eller undersektion i milstolps-fil
5. Uppdatera **denna översikt** om du inför **ny filtyp** eller byter konvention
6. När en snapshot är **helt åtgärdad**: flytta filen till **`../../archive/kritik-addressed/`** och uppdatera arkiv-README + tabellen ovan

---

## Relation till andra verktyg

- **`/control-agent`** (Cursor) → `workstream-sentry`: snabb **diff-baserad** second opinion (se `.cursor/skills/control-agent/SKILL.md`).
- **Orchestrator `verifier` / `PROTOCOL.md`**: formell körning; kritikmappen är **informell** men **persistent** i git.

---

*Skapad som gemensam ingång så flera agenter och du själv kan fortsätta “som vanligt” med tydliga handoffs.*
