# Avklarat — konsoliderat index

Levererade och mergade initiativ. **Detta index är den enda avsedda ytan här.**
Detaljplaner = git (`git log --follow`, `git show <sha>:<path>`). Återskapa inte
filzoo. Livscykel: [`plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

Egna detaljfiler behålls **bara** om kod/contract eller `*.stability.test.ts`
(`Källa:`) citerar dem — se avsnittet längst ned.

## Levererade initiativ

| Initiativ | Levererat | Kvar |
|---|---|---|
| **Dossier: färre sanningsytor + status-UX** (2026-08-11) | Planpaket + fusklapp #873; truth-projektion CI-grindad, F2-mute-ägare `f2-mute.ts`, Systemkarta #875; fas A-beslut #877; statussynk #881; docs-sanering + anti-antal-regel #882; Python-kopior/parsnings-tester raderade #885; Systemkarta som nav (flikar 6→5) #891; builder-statussanning lucka 1–3 + Ö2 #892. Begreppskarta: [`FUSKLAPP-BYGGBLOCK.md`](../../../FUSKLAPP-BYGGBLOCK.md) (rot). Plantext i git. | `SM-031`, jsdom-miljöskuld och `dossiers_lib`-F401-städ i [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) |
| **Lint: react-hooks warn-cleanup** (2026-08-11) | #889 — 22 builder-varningar borta (`deps` + `useSyncExternalStore` + scoped disables). Plantext i git. | Djup refaktor utan disable → [`../active/2026-08-11-react-hooks-refaktor/00-master-plan.md`](../active/2026-08-11-react-hooks-refaktor/00-master-plan.md) + backlog-skuld |
| **Sanering och uppdelning (10 steg)** (2026-08-01→08) | Steg 0–6: #706–#708, false-green #712/#715/#718/#720/#723/#725, Redis #714/#825, deps #717/#819, docs #713/#721/#853, megafil-splits #722…#862. Plantext i git. | Steg 7/8/9/10 → [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md) (skuld/ägarbeslut) |
| **Loggindex sökvägsägare (steg 1)** (2026-08-08) | #845 — fyra ägare för `logs/llm-segmentts-and-index`. | Steg 2 omdöpning → [`../archived/2026-08-02-loggindex-omdopning.md`](../archived/2026-08-02-loggindex-omdopning.md) |
| **Dossier-förenkling pool 27→18** (2026-08-05→06) | #828 + etapp 1–4 (#831–#833 m.fl.). Trenivåmodell behållen. | `SM-027` i backlog |
| **Sanering steg 1 false-green** (2026-08-01) | #712/#715/#718/#720/#723/#725 (se saneringsraden). | — |
| **Prodlogg efter /logg-internet** (2026-08-01→02) | #735/#736/#737/#739 (M#li1–M#li10). | M#li11/M#li12 i backlog |
| **Innehållsrevision** (2026-07-25→31) | #642/#674/#693; flagga på i alla miljöer (R14); `/versions`-trådning (R15). Kontrakt: `quality-gate.md`. | Sessionsbindning = backlog-P2 |
| **Grandmaster-stabilisering** (2026-06-18→22) | C1/C2, S1–S4, follow-up/preview, event-bus, false-green. Tag `MILSTOLPE-2026-06-21-grandmaster-stabil`. | Öppna defekter → backlog |
| **Kontrollflöde-konsolidering** (2026-07-07) | #360–#367. | — |
| **Stabilisering 2026-07** | #374–#383. | — |
| **Bug-swarm B01–B15** | 10 fixade (#181–#187); 3 policy. | [`bug-swarm/README.md`](bug-swarm/README.md) + backlog |
| **Wave 2026-04-20** (P21–P27, P29) | Repair/timeout/brief/v0-konsolidering. Detalj i git. | — |
| **Builder-åtgärdsprogram** (2026-07-25→27) | #623 + acceptans #629. | Små rester i backlog |
| **Preview/verifier-livscykel** (2026-07-24) | #599 (sex punkter). | — |
| **Verify/F3/domän** (2026-07-13) | #517/#518/#519. | Svansar → restlistan |
| **Env-yta konsolidering** (2026-07-22) | #573; Byggblock enda env-yta. | Restlista R5 m.fl. |
| **Builder-UI declutter** (2026-07-23→28) | Sanningsremsa/Lansering/ReleaseGate → logg. | — |
| **Capability surface ownership** (2026-07-28) | #639; `dossier-system.md`. | Ingen REPLACES-radering (ägarbeslut) |
| **Builder runtime-robusthet** (2026-07-13→28) | 503-backoff, pool-mätning, CSP/font. | Restlista R12/R13 |
| **Restlista R1–R15 (levererade delar)** (2026-07-28→08) | R1–R4/R6/R7/R9–R11/R14/R15 + R8-montering #659. | Öppna: R5/R8/R12/R13 i [`../active/2026-07-27-restlista-builder-f3-env.md`](../active/2026-07-27-restlista-builder-f3-env.md) |
| **Körningslogg + tokenmätning** (2026-07-25) | #609/#613. | Steg 3 = produktbeslut i backlog |
| **Backoffice-stringens + Byggstenar** (2026-07-21→29) | #615/#640/#649/#654 m.fl.; Fas C UI-varv kört. | — |
| **Builder-UI prod-observation** (2026-07-30→31) | Meny/status/chatt/miniatyrer. | Små noterade rester (ej plan) |
| **shadcn-registry + Beskriv** (2026-07-22) | #570–#586; detalj: [`2026-07-22-shadcn-registry-beskriv-komposition.md`](2026-07-22-shadcn-registry-beskriv-komposition.md). | Valfria backlog-idéer |
| **Prod-körning dossiers** (2026-08-05) | A1 #828, A3/SM-023 #839, A4/SM-024 #842; dossier-förenkling ovan. Plan → [`../archived/2026-08-05-prodkorning-dossiers/`](../archived/2026-08-05-prodkorning-dossiers/). | A5 (beslut), `SM-025` (prod-bevis), UX-go under MVP-frys → backlog |

## Kvar som filer (fortsatt referensvärde)

**Kod-/contract-citerade:**
[`2026-06-19-inspector-rendering-arkitektur.md`](2026-06-19-inspector-rendering-arkitektur.md) ·
[`2026-06-27-server-verify-distributed-lock.md`](2026-06-27-server-verify-distributed-lock.md) ·
[`2026-07-08-dossier-legacy-import.md`](2026-07-08-dossier-legacy-import.md) ·
[`repair-loop-hardening.md`](repair-loop-hardening.md) ·
[`P30-r3f-tuple-and-repair-feedback.md`](P30-r3f-tuple-and-repair-feedback.md) ·
[`P31-feature-runtime-envs-and-f3-toggle.md`](P31-feature-runtime-envs-and-f3-toggle.md) ·
[`SEO-F3-PROMOTION-NEXT-PR.md`](SEO-F3-PROMOTION-NEXT-PR.md) ·
[`2026-07-22-shadcn-registry-beskriv-komposition.md`](2026-07-22-shadcn-registry-beskriv-komposition.md)

**Test-`Källa:`** under [`grandmaster/`](grandmaster/): `02-stabilitetstester.md`,
`07-false-green-hardning.md`, `aktiviteter/{S2,S3,A7-1,A7-2,5-3,5-5,C2}.md`.

## Operativ sanning (inte här)

[`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) ·
öppna defekter: [`BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md).
