---
id: gm-00-master-plan
status: active
created: 2026-06-18
linear: null
parent: 2026-06-17-cleanup-forenkling-handoff
supersedes: 2026-06-18-stabilitet-schemas-aktivitetsplan
---

# Grandmaster-plan — Sajtmaskin: stabilitet, kontrakt och städning (Nivå 1)

**Detta är nivå 1** — målbild + index över de 8 områdena (nivå 2) + sekvens.
Nivå 2 = ett dokument per område i samma mapp. Nivå 3 = aktiviteter per område,
**skapas just-in-time** när området är på tur. Plan-nivåmodellen är kodad i
[`.cursor/rules/plan-lifecycle.mdc`](../../../../.cursor/rules/plan-lifecycle.mdc).

Slår ihop tre källor: `deep-research-report.md`, `docs/handoffs/2026-06-17-cleanup-forenkling-handoff.md`
och "Controlled Aggression"-rapporten. De arkiveras vid städningen (område 8), inte nu.
Besluten bakom planen: [`docs/contracts/beslut/0001-...`](../../../contracts/beslut/0001-kontrakt-stabilitet-och-plannivaer.md).

---

## 1. Målbild (nordstjärna)

Sajtmaskin ska förbli **rolig, aggressiv och snabb** — och bli mindre buggig genom
**små hårda kontrakt**, inte ett styrningslager. Vi lånar tre saker lättviktigt från
Sajtbyggaren (referens: `C:\Users\jakem\Desktop\sajtbyggaren`, läses read-only, indexeras ej):

| Lånar (lätt) | Portar INTE (för trögt) |
|---|---|
| Stabilitetstester + snabb lane | `governance/` (30+ ADR), `governance.yml` |
| Kontraktslager (schemas/policies/regler/beslut) | "policies as source of truth"-styrning |
| Delivery-bias ("förmåga före dokumentation") | 1500-raders allowlists, dubbel Python/Next-stack |

Kärnflödet som allt mäts mot: **prompt → företagshemsida → preview → följdprompt → ny version.**
Om UI visar grönt måste runtime stödja det. Follow-up är delta på tidigare version, inte ny init.

## 2. Vad som ändrats mot källdokumenten (kod = sanning)

| Fynd vid verifiering mot HEAD (`7c98b019…`) | Konsekvens |
|---|---|
| Master står förbi rapportens "stabila" `c0e0516`. | Rapportens stabil-SHA + CI-rekar = historik, ärvs inte. |
| **Full testsvit kör redan på varje PR** (`ci.yml`). | Vi bygger inte testfundament — vi lägger en kuraterad lane ovanpå. |
| LLM-evals finns men är instabila. | **Parkeras.** Gaten = stabilitets-lane + senare runtime/UI-smoke. |
| `schemas/` blandade in planering (`plan-file.schema.json`). | Planering → regel; schema = bara dataformat (ADR 0001). |

## 3. Stabilitetstester (tidigare "regressionstester")

Bredare än regression: större/svårare buggar **och** UX-invarianter. Exempel (ditt):
att `åäö` renderas korrekt i användarprompten i builder-chatten under generering.

```
lokalt:   npm run test:stability     (innan commit, sekunder)
på PR:    CI-jobb på pull_request     (utöver dagens fulla svit)
vid push: CI-jobb på push till master
```

Disciplin (delivery-bias): lägg ett test bara när det (a) skyddar nytt kontrakt,
(b) ersätter ett äldre, eller (c) låser en **konkret** tidigare fixad bugg. Varje test
pekar på sin källa (`[x]`-rad i `BUG-SWARM-BACKLOG.md` eller öppen P1/P2). Inga breda allowlists.

Detaljer + seed-invarianter: [`02-stabilitetstester.md`](02-stabilitetstester.md).

## 4. Kontraktslager

Fyra pelare, lätt: [`docs/contracts/`](../../../contracts/README.md). Schema = struktur ·
Policy = värden · Regel = process · Beslut = varför. Tre finns redan; **beslut (ADR)** är nytt.

## 5. Områdesindex (Nivå 2)

Varje område = eget dokument. `owner-surface` = den yta området äger (verifieras mot HEAD
innan nivå 3-aktiviteter skapas). Parallellt = distinkta ytor.

| # | Område | Wave | Owner-surface (grovt) | Beroende |
|---|---|---|---|---|
| [1](01-kontrakt-och-regler.md) | Kontrakt & repo-regler | 1 | `docs/contracts/`, `.cursor/rules/`, `config/naming-dictionary.json` | — |
| [2](02-stabilitetstester.md) | Stabilitetstester | 1 | `package.json`, `.github/workflows/ci.yml`, `docs/testing.md`, stability-tester | — |
| [3](03-dokumentation-och-kartor.md) | Dokumentation & kartor | 1 | `README.md`, `docs/architecture/repo-tree.md`, plan-arkiv | — |
| [4](04-prompter-init-och-followup.md) | Prompter (init + follow-up) | 2 | `config/prompt-core/`, `src/lib/gen/system-prompt/`, brief-bygge | 1 |
| [5](05-followup-och-preview-kontrakt.md) | Follow-up & preview-kontrakt | 2 | `src/lib/gen/follow-up-contract.ts` (ny), preview-session, finalize | 1 |
| [6](06-status-och-ui-ux.md) | Status & UI/UX | 2 | `VersionHistory.tsx`, `BuilderShellContent.tsx` | 1 |
| [7](07-false-green-hardning.md) | False-green-härdning | 3 | autofix `cross-file-import-checker.ts`, F2/F3-postcheck | 2, 5 |
| [8](08-cleanup-och-hygien.md) | Cleanup & hygien | löpande | `.cursorignore`, `.gitignore`, scratch, deps | gemensam |

## 6. Sekvens (waves)

```
Wave 1 (fundament, parallellt):    omr 1 · omr 2 · omr 3
            │ (gates + kontrakt + kartor på plats)
Wave 2 (beteende, parallellt):     omr 4 · omr 5 · omr 6
            │
Wave 3 (högst risk):               omr 7  (false-green, efter 2+5)
Löpande/gemensam:                  omr 8  (städning — gör vi tillsammans, ej autonomt)
```

## 7. Städning — gemensam (område 8)

Körs **tillsammans, när det är dags** — inte autonomt av en agent. Kandidater
(cursorignore-logs, radera tracked scratch, pensionera `plan-file.schema.json`,
arkivera källdokumenten, eval-namnskugga, repo-tree-synk, `next`-bump). Se [`08-cleanup-och-hygien.md`](08-cleanup-och-hygien.md).

## 8. Vakt mot Sajtbyggaren-ifiering (inte detta)

Ingen `governance/`-mapp, ingen ADR-stapel som merge-blocker, ingen 1500-raders allowlist,
ingen dubbel Python/Next-styrning, ingen stor rewrite, inga LLM-evals som gate just nu.
Kod är source of truth.

## 9. Status / nästa beslut

- [x] Nivå 1 (denna) + 8 nivå-2-stubbar + kontraktslager + plan-regel.
- [ ] **Jake:** justera områdesnamn/ordning om något skaver.
- [ ] **Jake:** välj första området att starta (default: område 1 → 2 → 3 parallellt).
- [ ] När ett område startar: skapa dess nivå-3-aktiviteter (8–10 st, smal `owner_files` var).
