# Kritikfiler — typer och index (parallell granskning)

Den här mappen samlar **mänskligt och agent-stött** granskning **vid sidan av** orchestratorns remediation-commits. Syftet är att spåra vad som påståtts, vad som verifierats, och vad som **fortfarande** är öppet — så en **kontrollagent** (du eller annan agent) kan arbeta mot samma backlog.

**Levande öppna punkter (konsoliderat):** [`docs/plans/active/kritik-consolidated-open-items.md`](../../../docs/plans/active/kritik-consolidated-open-items.md) — **en** master-tabell; [`kritik-derived-backlog.md`](../../../docs/plans/active/kritik-derived-backlog.md) pekar dit.

---

## Typer av filer (mönster)

| Typ | Namnmönster | Innehåll |
|-----|-------------|----------|
| **Milstolpe / helhets-%** | `NNpct-<bokstav>.md` | Snapshot när *whole vision* ungefär **NN%** enligt `external-review-remediation-progress.md`: vad som levererats, risker, “missat”, rekommenderad nästa ordning. |
| **Commit-kedja (→ ~100%)** | `NNpct-<bokstav>.md` **en fil per** relevant `master`-commit i remediation-kedjan | Kort leverans enligt commit + `SHA` + pekare till **nästa** commit i kedjan; valfri verifieringsnotis. *Saknar du en commit mellan två filer — backfilla.* |
| **Avgränsat spår** | fritt namn, t.ex. `vercel-templates-path-verification-note.md` | En **tråd** som inte ska blandas med hela remediation (t.ex. gitignore vs `main`/`master`, script-sökvägar). |
| **Index / meta** | `KRITIK-OVERVIEW.md` (denna fil) | **Vad filerna betyder** + tabell över **aktiva** filer — minskar att nya agenter uppfinner om namngivning. |

**OBS:** Procentsiffrorna är **ungefärliga**; sanningskälla för “hur långt vi kommit” är alltid **`docs/plans/active/external-review-remediation-progress.md`** + `git log origin/master`.

---

## Aktiva filer (i denna mapp)

| Fil | Roll |
|-----|------|
| `KRITIK-OVERVIEW.md` | Denna fil — typregister + index. |

*Inga milstolpsfiler just nu; lägg till `NNpct-*.md` vid nästa handoff.*

**Arkiv:** [`../../archive/kritik-addressed/`](../../archive/kritik-addressed/README.md) — där ligger tidigare `18–84pct-*`, `42pct-v`, `vercel-templates-path-verification-note.md` m.fl.

---

## Arbetsflöde för kontrollagent

1. `git fetch origin` → `git log origin/master -10 --oneline` (inom samma session, **direkt före `git push`:** kör `git fetch` + `git pull origin master` igen så inget nytt från andra agenten missas — se även [CONTINUATION.md](../../../docs/plans/avklarat/external-review-execution/CONTINUATION.md) § *Principer*).
2. Läs **`external-review-remediation-progress.md`** (tabell + *Next* + *Uncertainties*)
3. Läs **`kritik-consolidated-open-items.md`** för öppna buggrader
4. Vid större steg: lägg **`NNpct-<bokstav>.md`** med verifiering mot diff / tester
5. Vid smal tråd: eget beskrivande namn eller undersektion i milstolps-fil
6. Uppdatera **denna översikt** om du inför **ny filtyp** eller byter konvention
7. När en snapshot är **helt åtgärdad**: flytta filen till **`../../archive/kritik-addressed/`** och uppdatera arkiv-README + tabellen ovan

---

## Relation till andra verktyg

- **Samlad backlog:** [`docs/plans/active/kritik-consolidated-open-items.md`](../../../docs/plans/active/kritik-consolidated-open-items.md)
- **`/control-agent`** (Cursor) → `workstream-sentry`: snabb **diff-baserad** second opinion (se `.cursor/skills/control-agent/SKILL.md`).
- **Orchestrator `verifier` / `PROTOCOL.md`**: formell körning; kritikmappen är **informell** men **persistent** i git.

---

*Skapad som gemensam ingång så flera agenter och du själv kan fortsätta “som vanligt” med tydliga handoffs.*
