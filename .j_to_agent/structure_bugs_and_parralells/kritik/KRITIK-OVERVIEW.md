# Kritikfiler — typer och index (parallell granskning)

Den här mappen samlar **mänskligt och agent-stött** granskning **vid sidan av** orchestratorns remediation-commits. Syftet är att spåra vad som påståtts, vad som verifierats, och vad som **fortfarande** är öppet — så en **kontrollagent** (du eller annan agent) kan arbeta mot samma backlog.

---

## Typer av filer (mönster)

| Typ | Namnmönster | Innehåll |
|-----|-------------|----------|
| **Milstolpe / helhets-%** | `NNpct-<bokstav>.md` (t.ex. `18pct-k`, `42pct-v`, `43pct-r`) | Snapshot när *whole vision* ungefär **NN%** enligt `external-review-remediation-progress.md`: vad som levererats, risker, “missat”, rekommenderad nästa ordning. |
| **Commit-kedja (→ ~100%)** | `NNpct-<bokstav>.md` **en fil per** relevant `master`-commit i remediation-kedjan | Kort leverans enligt commit + `SHA` + pekare till **nästa** commit i kedjan; valfri verifieringsnotis. *Saknar du en commit mellan två filer — backfilla.* |
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
| `78pct-r.md` | ~78% whole: reconcile segment-% (W3 track komplett, scripts ~95%), eval vs scrape docs, `EGEN_MOTOR_V2` (`8b61cc49`). |
| `79pct-l.md` | `78d657d1` — ParticleOrb in-view + reduced-motion (landning ~79%). |
| `80pct-c.md` | `bfd7cc8e` — config-dashboard, `eval-output/`, deploy skipAutoFix, cipher-timeout (~80%). |
| `80pct-d.md` | `743565d9` — docs hub, plans index, handoff/lifecycle-drift. |
| `80pct-o.md` | `5985898e` — orchestrator log passus (docs sweep + lifecycle). |
| `81pct-p.md` | `7696f1f8` — `/om`, `/blogg`, footer, sitemap (~81%). |
| `82pct-u.md` | `304bf6d5` — W2 409 UX i `useBuilderDeployActions` + docs sync (~82%). |
| `83pct-s.md` | `fe22c9ee` — Sentry i registry + detektion; builder lansering-copy (~83%). |
| `83pct-b.md` | `4f3fd5f5` — en lanseringsyta (Lansering-kort), `deploy-readiness-copy` + Vitest, kortare hints (~83% oförändrat). |
| `83pct-t.md` | `d9fbee6c` — tips i Inställningar, slankare TipCard, OpenClaw lansering-ytor. |
| `83pct-g.md` | `4d7c96a6` — docs: `origin/master` vs `main` för agenter. |
| `83pct-m.md` | `4dd94273` — Mer-meny, svenska header-etiketter, OpenClaw surfaces. |
| `83pct-i.md` | `0eaee012` — svensk copy header, `MODEL_TIER_OPTIONS`, `terminology.mdc` + routing-doc. |
| `83pct-y.md` | `8bde15b7` — språkpolicy + arbetsyta/workspace-hygiene; **batch-verifiering** typecheck + vitest (348). |
| `84pct-c.md` | `b29f9def` — Sanity, Contentful, Storyblok (`cms`), MongoDB; env-policy; Vitest; progress ~84% / integration ~74%. |
| `84pct-u.md` | `d36d90d4` — `webscraper-url.test.ts`, normalisering + canonical key (utan nätverk). |
| `84pct-a.md` | `0dac23c4` — Algolia sök i registry + detection + env-policy. |
| `84pct-e.md` | `52de032d` — Meilisearch i registry + detection + env-policy; batch typecheck + vitest (357). |
| `vercel-templates-path-verification-note.md` | Vercel scrape-sökväg, `main` vs `master`, agentpåståenden. |
| `KRITIK-OVERVIEW.md` | Denna fil — typregister + index över övriga kritikfiler. |

**Arkiv (åtgärdade snapshots):** [`../../archive/kritik-addressed/`](../../archive/kritik-addressed/README.md) — bl.a. `43pct-r.md`, `56pct-h.md`, `72pct-w.md`, `75pct-e.md` (se README där).

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
