---
id: gm-00-master-plan
status: active
created: 2026-06-18
linear: null
parent: 2026-06-17-cleanup-forenkling-handoff
supersedes: 2026-06-18-stabilitet-schemas-aktivitetsplan
---

# Grandmaster-plan — Sajtmaskin: stabilitet, kontrakt och städning (Nivå 1)

> **Styrning:** Detta är produktens **stabilitetsplan, inte ett dokumentationsprojekt.** Varje aktivitet ska förbättra kärnflödet eller minska agentförvirring — annars hör den inte hemma här.

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
Ett DB-exempel: `db:schema-drift` låser att **avsett** schema (`src/lib/db/schema.ts`)
matchar **applicerat** (migrations) — finns redan men körs bara soft; höjs till gate (S4).

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

**Terminologi-disciplin:** inför inte nya svåra engelska tech-begrepp i stabiliseringsfasen —
håll dig till befintliga i [`glossary.md`](../../../architecture/glossary.md); ny/ändrad term
kräver kort motivering (regel: [`terminology.mdc`](../../../../.cursor/rules/terminology.mdc)).
Glossaryn är **uppslagslistan** och får en **light-check vid push/PR/merge** (warn-först) —
aktivitet [`C2`](aktiviteter/C2-ordlista-check.md), medvetet mjukare än Sajtbyggarens.

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

> **Bug-swarm-koppling:** vilka öppna `BUG-SWARM-BACKLOG.md`-rader som hör till vilket område, vad som redan är beslutat och när det tas upp → [`bug-swarm-koppling.md`](bug-swarm-koppling.md).

**Städ-/struktur-pass per område (scoped):** varje nivå-2-område **inleds eller avslutas med
ett städ-/struktur-pass begränsat till områdets owner-surface** — radera oanvända filer,
omorganisera mappar om en tydligare struktur finns, konsolidera dubbletter, en enkel klar
förbättring. Standard sista nivå-3-aktivitet (`Z-städ`), körs när områdets huvudarbete är
verifierat (typecheck/test grönt). Skilt från **område 8** = den globala, repo-breda
städningen vi gör tillsammans. Scope smalt: städ ≠ fri omorganisation (jfr `workflow.mdc`).

## 6. Sekvens — körordning (skiljer sig från områdesnumret)

Områdesnumret = **filordning**. Faktisk **körordning**: tester gör resten tryggare, så stabilitet före kontrakt (annars riskerar agenten producera mer plan än produkt).

| Steg | Område | Varför |
|---|---|---|
| 0 | branch-hygien | ren PR-bas innan arbete |
| 1 | **2** Stabilitetstester (minimum) | gör resten tryggare |
| 2 | **3** Dokumentation & kartor | mindre agentförvirring |
| 3 | **1** Kontrakt & regler (light) | undvik mer plan än produkt |
| 4 | **6** Status & UI/UX (event-bus) | snabb bugglättnad |
| 5 | **5** Follow-up & preview-kontrakt | produktens hjärta |
| 6 | **7** False-green-härdning | störst kvalitet, mest beteende → sist |

Område **8** (städning) löpande/gemensamt, ej autonomt. Parallellt = distinkta `owner_files`.

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
- [x] **Område 1–3 levererade** (§6 steg 0–3): `S1` #147 · `S2` #151 · `S4` #150 · `D2` #148 · `C1` #152 · `C2` #153 (+ H0/D1). Status per aktivitet: [`aktiviteter/README.md`](aktiviteter/README.md). Löpande logg: [`_loggbok.md`](_loggbok.md). Körnings-handoff: [`../../../handoffs/2026-06-18-grandmaster-execution-handoff.md`](../../../handoffs/2026-06-18-grandmaster-execution-handoff.md).
- [x] **Omr 2 `S3` statusresolver-invariant:** aktiverad som hård import-invariant i **6-3 punkt 2** (`status-resolver-single-writer.stability.test.ts`) + legacy-resolvern `resolveEngineVersionDisplayStatus` borttagen. **#163 mergad 2026-06-19** (`1713d4fdf`).
- [x] **Område 7 runtime-kärna landad:** #149 promote-guard / false-green-fix mergad (`b8d85a338`) — `passed:false` vid block, `acceptRepair`-guard, repair-pass-telemetri. + A7-1 #155 (test). + A7-2 #156 (flag-gate, default-OFF, `c2f2a25db`).
- [x] **Område 6 (§6 steg 4) KLART:** `6-1` (#159) + `6-2` (#160) + `6-3 punkt 1` (#162) + `6-3 punkt 2` (#163, `1713d4fdf`) **alla mergade**. Event-bus-status-flip klar för shell, preview-empty-state och `VersionHistory`-badgen; legacy `resolveEngineVersionDisplayStatus` (+ typ) **raderad**, S3-invarianten vaktar mot återinförande. False-green-vakt genomgående (degraderad/skipped ≠ solid grön). Stänger N#6/G#32.
- [ ] **Öppna PR:er:** endast **#140** (DB+Blob-gate, **parkerad** — P1-säkerhet = grundhygien-blocker; överlappar S4:s keyless `db:schema-drift`-gate; infra-/inspector-spåret ägs av annan agent). #156 (A7-2, `c2f2a25db`) + #154 (LLM-flow-canvas + P0-surfacing-fix, `674a862ac`) **mergade 2026-06-19**.
- [ ] **Backlog (egna pass — detalj i [`_loggbok.md`](_loggbok.md) § Städ-/omorg-kandidater):** S3-lane-härdning (warn-only stability-lane → blockerande `test:ci`) · VADE-perf `readAll`-per-rad på pollade `/versions` · E2 multi-instans efemär in-memory event-bus · canvas auto-PR-CI (`CANVAS_PR_TOKEN`/PAT för `llm-flow-canvas.yml`) · område 8-svans (`.gitignore`/`.cursorignore`-prune, arkivera källdocs, `next`-bump, eval-namnskugga).
- [x] **Område 5 (§6 steg 5) — Follow-up & preview-kontrakt: kärnan klar (2026-06-21).** 5-1 #165 · 5-2 #166 · 5-3 #168 · 5-3b #172 · 5-4 #169 · 5-5 #174 · 5-7 lane-gate #176 · 5-Z doc-drift — alla mergade/landade. Stale-base→409 + scaffold/route/variant-frys + route-floor + capability-floor är nu **blockerande CI-gatade**. **5-6 `previewSessionId` parkerad** (tunt/redundant; den värdefulla "preview re-pinnar efter finalize / anti-stale-falsk-grön"-varianten = egen scopad backlog).
- [ ] När ett område startar: skapa dess nivå-3-aktiviteter, smal `owner_files` var.
