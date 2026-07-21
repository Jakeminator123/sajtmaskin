# Avklarat — konsoliderat index

Levererade och mergade initiativ. **Detta index är den enda avsedda ytan här** —
detaljplanerna är trimmade och full text finns i **git-historik** (`git log --follow`,
`git show <sha>:<path>`). Återintroducera inte stora plan-/aktivitetsfiler; väv in en
rad i tabellen nedan i stället. Livscykel: [`../../../.cursor/rules/plan-lifecycle.mdc`](../../../.cursor/rules/plan-lifecycle.mdc).

Kvar som egna filer finns bara två sorters historik med **fortsatt referensvärde**:
kod-/contract-citerade planer (länkade från källkod) och test-citerad invariant-provenance
(länkad från stabilitetssviten). Allt annat är git.

## Levererade initiativ

| Initiativ | Levererat (PR) | Kvarvarande |
|---|---|---|
| **Grandmaster-stabilisering** (2026-06-18→22) | Scope 100 %. 1 Kontrakt C1 #152/C2 #153 · 2 Stabilitetstester S1 #147/S2 #151/S3 #163/S4 #150 · 3 Docs D1–D2 #148 · 5 Follow-up/preview #165/166/168/169/172/174/176 · 6 Status/event-bus #159–163 · 7 False-green #149/155/156/177/179/180 + B09 #185 · 8 Cleanup. Tag `MILSTOLPE-2026-06-21-grandmaster-stabil`. | Live-backlog router:as från [`../active/README.md`](../active/README.md); detalj i [`grandmaster/_backlog-deferrad.md`](grandmaster/_backlog-deferrad.md). |
| **Kontrollflöde-konsolidering** (2026-07-07) | Alla 7 faser (#360–#367): Normalize uppströms, `riskScore`, en RepairGate, preview-resync, terminologi, eval-svit. Beslutsunderlag i [`kontrollflode/underlag/`](kontrollflode/underlag/). | — |
| **Stabilisering 2026-07** | Våg 1–4 (#374–#383): init-grön, F3-integrationer hela vägen, preview/DB-P2:or. | — |
| **Bug-swarm B01–B15** | 10 fixade (#181/183/184/185/186/187), 3 ägarbeslut (B05/B07/B08). Historik: [`bug-swarm/README.md`](bug-swarm/README.md). | Öppna defekter → [`../../../BUG-SWARM-BACKLOG.md`](../../../BUG-SWARM-BACKLOG.md). |
| **Wave 2026-04-20** (P21–P27, P29) | Per-tier repair/timeout/brief-policies, deep-brief-guard, motion-safe verifier, AST-patch av `next.config`, v0-engine-konsolidering (Class C-routes canonical). Detaljer i git. | UX-polish-debt spåras i [`../archived/Kvarvarande-uppgifter.md`](../archived/Kvarvarande-uppgifter.md). |

## Kvar som filer (fortsatt referensvärde)

**Kod-/contract-citerade planer** (länkade från källkod — radera inte utan referensmigrering):

- [`2026-06-19-inspector-rendering-arkitektur.md`](2026-06-19-inspector-rendering-arkitektur.md) — `docs/ENV.md`, `inspect-bridge-*.ts`
- [`2026-06-27-server-verify-distributed-lock.md`](2026-06-27-server-verify-distributed-lock.md) — `db/schema.ts`, `chat-repository-pg.ts`, migration
- [`2026-07-08-dossier-legacy-import.md`](2026-07-08-dossier-legacy-import.md) — `docs/contracts/dossier-system.md`
- [`repair-loop-hardening.md`](repair-loop-hardening.md) — `docs/contracts/fixer-registry.md`
- [`P30-r3f-tuple-and-repair-feedback.md`](P30-r3f-tuple-and-repair-feedback.md), [`P31-feature-runtime-envs-and-f3-toggle.md`](P31-feature-runtime-envs-and-f3-toggle.md) — `fixer-registry.ts`, `autofix/pipeline.ts`
- [`SEO-F3-PROMOTION-NEXT-PR.md`](SEO-F3-PROMOTION-NEXT-PR.md) — `projects/preferences-schema.ts`

**Test-citerad invariant-provenance** (`Källa:`-referens från stabilitetssviten) i
[`grandmaster/`](grandmaster/): `02-stabilitetstester.md`, `07-false-green-hardning.md` och
`aktiviteter/{S2,S3,A7-1,A7-2,5-3,5-5,C2}.md`. Rör dessa bara om motsvarande
`*.stability.test.ts`-invariant ändras.

## Operativ sanning (inte här)

Aktuell arkitektur och körflöde: [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md)
(§ FAS 2 orchestration/build, § FAS 3 preview/deploy). När en äldre plan inte finns som fil:
behandla detta index som pekare och använd git-historik.
