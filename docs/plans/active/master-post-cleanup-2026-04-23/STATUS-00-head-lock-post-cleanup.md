# STATUS 00 — head lock post-cleanup

**Datum:** 2026-04-23
**Författare:** orkestrator-agent (denna chatt)
**Plan:** [00-head-lock-post-cleanup.md](./00-head-lock-post-cleanup.md)

---

## 1. Exakt HEAD

| Var | SHA | Kommentar |
|---|---|---|
| Lokal `master` (HEAD) | `6bde8aed8b7c4a770e482ac839352ecfa73cea55` | senaste lokala commit |
| `origin/master` | `049d0ad6dd841d9d678d61fe845d27b41e50181a` | det vågserien antog som "synkat läge" |
| Diff | **lokal är 1 commit före origin** | enbart docs (`docs(architecture): add world-class target + slim glossary + tighten cursor rules`) |

### Avvikelse mot CURRENT-STATE-NOTE
`CURRENT-STATE-NOTE.md` säger "`master` och `origin/master` är synkade". Det stämmer **inte** — det finns en upushad docs-commit lokalt. Den är ofarlig (bara `.cursor/rules/`, `docs/architecture/`, ingen runtime-kod), men den måste pushas innan andra agenter klonar/förgrenar från origin, annars startar de från fel bas.

**Rekommendation:** `git push origin master` innan första kodagent startas. Beslut väntar på din go.

### Cleanup-vågen från `c7798dce5` → `6bde8aed8`
Sex commits, motsvarar vad `CURRENT-STATE-NOTE.md` beskriver:

| SHA | Cleanup-effekt |
|---|---|
| `97762f446` | docs(env): SAJTMASKIN_BLOCKING_ESLINT* + F2/F3 gate note |
| `c4fbd9b20` | refactor(quality-gate): F2 designPreview lane → typecheck only |
| `61d264627` | fix(preview-host): inline 101 handshake (HMR-WS retry-loop) |
| `9e70007c4` | chore(sync): F2-gate slim → backoffice + strict schema + plan |
| `049d0ad6d` | docs(dossiers): DOSSIER_PIPELINE=true note |
| `6bde8aed8` | docs(architecture): world-class target + glossary + cursor rules |

## 2. Preview-host-fix: status

| Aspekt | Status | Källa |
|---|---|---|
| Committad i master | ✓ Ja | `61d264627` syns i log |
| Pushad till origin | ✓ Ja | origin/master innehåller den (origin = `049d0ad6d`, dvs efter fixen) |
| Deployad till live | **? Okänt lokalt** | git visar inte deploy-state. Måste verifieras i Vercel/hosting i Plan 01. |

**Beslut:** preview-host-deploy-status är **oklar** härifrån. Plan 01 är blockerande för plan 02 och plan 03 just därför.

## 3. Krävs preview-host deploy innan kodspår fortsätter?

**Ja, för Wave 1+ runtime-spår (02, 03, 06, 07).** Anledning: ingen mening att börja jaga "modal ljuger" eller "followup_technical false-red" om båda symptomen försvinner med en deploy som väntar i kö.

**Nej, för analysspår (04).** Plan 04 är inventering av fixer-ytan — den är runtime-oberoende och kan starta parallellt med plan 01.

## 4. Plan-tabell — full / short / skip

Bedömning baseras på (a) vad cleanup-vågen redan löst, (b) blocking-relationer, (c) hur direkt planen löser ett användarsymptom. `*-pending` betyder att slutbedömningen kan justeras ned efter Plan 01 smoke.

| Plan | Status | 1-rads motivering |
|---|---|---|
| **01** rollout & smoke baseline | **full** | Inte kod, men icke-skippbar: avgör vad som är ops vs kod nedströms. |
| **02** F2/F3 runtime truth + version modal | **full-pending** | F2-lane är slimmad i kod, men UI-statusens hopkoppling till F2/F3 är oprövad post-deploy; sannolikt fortfarande arbete. → kan bli `short` om Plan 01 smoke visar att modalen redan slutat ljuga. |
| **03** followup_technical skip-reason | **full-pending** | Specifik bug, troligen live. → kan bli `short` om felklassningen försvinner med deploy. |
| **04** fixer-surface inventory | **full** | Förutsättning för 05 och 09. Ren analys, ingen runtime-risk. |
| **05** single fixer entrypoint + lanes | **full** | Beror direkt på 04. Ingen genväg. |
| **06** Deep Brief + delta contract | **short-likely** | Mycket av AI-assist redan bortstädat i tidigare omtag-vågor. Sannolikt kontrakt + tests + tombstones snarare än stor refactor. |
| **07** 3D capability + three-fiber | **full** | Pizza-scenariot är fortfarande huvudverklighetstestet enligt README; ingen indikation på att det löste sig. |
| **08** core simplification (orchestrate.ts, route-plan.ts) | **full** | Stor men mekanisk; ingen beteendeändring först. Skippas inte. |
| **09** legacy ripout + config pruning | **short-likely** | Cleanup-vågen + tidigare omtag har redan rivit mycket; behöver lista från 04 för att vara meningsfull. |
| **10** latency budgets + safe skip | **full-pending** | Inte akut, men ingen anledning att stryka i förväg. |
| **11** unified repair call | **full-pending** | Arkitekturpass; beror på 05+09+10. |
| **12** PromptKit canonical composer | **full-pending** | Slutpass; beror på 06+11. |

### Tidiga skip-kandidater (tas inte beslut förrän Plan 01)
Inga `skip` i förskott. `WORKTREE-RUNBOOK.md` säger explicit att man kan **stoppa hela serien efter wave 3** om modalen + follow-up + 3D blivit bra. Det är troligen rätt avslutspunkt — planerna 08–12 kan då förskjutas eller bantas mer drastiskt.

## 5. Rekommenderad körning från och med nu

### Wave 0 (denna chatt, denna tur)
- ✓ Plan 00 — det här dokumentet.
- ⏭ Plan 01 — manuell ops, väntar på dig (deploy-knapp + smoke-runs).

### Wave 1 (efter Plan 01 är grön)
- Plan 02 (Opus 4.7 thinking) — runtime/UI-status, kritiskt.
- Plan 04 (GPT-5.4 medium eller Codex) — inventering, kod-tungt men inte runtime-kritiskt.
- Mergeordning: 02 → 04.

(Resterande vågor: se [WORKTREE-RUNBOOK.md](./WORKTREE-RUNBOOK.md))

## 6. Hårda blockerare innan Wave 1 startar

1. **Push lokala docs-committen `6bde8aed8` till origin** — annars klonar plan-agenter från en bas som saknar nya glossary/rules och kan ge motstridiga beslut.
2. **Plan 01 deploy + smoke kör klart.**
3. **Inga andra agenter aktiva på berörda filer i master under wave-fönstret.**

## 7. Observerade övriga risker

- Repo:t har **många kvarliggande worktrees** under `~/.cursor/worktrees/` från tidigare Cursor Cloud Agent-omgångar (omtag fas 2A/2B/2C, P26-P34, m.fl.). De är inte aktiva men fyller branchnamnsutrymme. Inget hinder, men nya plan-worktrees bör läggas i en egen, ren mapp (förslag: `C:\Users\jakem\dev\projects\sajtmaskin-waves\plan-02\` etc.) så de är lätta att städa efter serien.
- `.vscode/settings.json` har en lokal modifiering — irrelevant för planerna, ingen åtgärd.
- `.tmp/` och `sekventser/` är untracked — `.tmp/` kan rensas, `sekventser/` (planpaketet) bör committas eller flyttas till `docs/plans/` för spårbarhet om du vill ha det i historiken.

## 8. Klar — väntar på din go för:

- [ ] Pusha `6bde8aed8` till origin (`git push origin master`)
- [ ] Starta Plan 01 (manuell deploy + smoke)

Sedan producerar jag paste-redo prompter för Wave 1 (plan 02 + plan 04) enligt det tiered modellupplägget vi enades om.
