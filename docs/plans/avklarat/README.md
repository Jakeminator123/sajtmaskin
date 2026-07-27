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
| **Builder-åtgärdsprogram efter observationssession** (2026-07-25→27) | Sex spår levererade i #623 (F1–F9 samt Ö1–Ö11; F10 konsoliderad in i innehållsrevisions-raden). Alla fem ägarbeslut fattade: B1 (b) noll integrationskod + synlig förklaring · B2 (b) Lansering-kortet bara vid `blocked`/`warning` · B3 `Lägg till block` · Ö5 ikonkluster i headern · Ö10b bild-av-ytan skjuten. Acceptansuppföljning i #629. Defektrader: [`bug-swarm/backlog-arkiv-2026-07-25.md`](bug-swarm/backlog-arkiv-2026-07-25.md). | **Acceptanskörningen genomförd i prod 2026-07-27** (chat `bcd3b493`, deploy `dpl_41GBecFhEwXCZeWvmmwRbCpEBKqa`) med Mailchimp-prompten: sju av åtta kontroller gröna. Kontroll 8 (ingen rå kodvägg) föll — F9:s fix valde fence-markören före stream-markören, och spår 01 steg 3 föll av en annan orsak än den planen antog (snapshot-nyckelbudgeten tappade `mutedCapabilities` innan den nådde databasen). Båda åtgärdade i #629. Klickrundorna för spår 04, 03 och 06 gröna; spår 05:s inspektorsmeny kunde inte drivas syntetiskt över iframe-gränsen och signerades av ägaren mot kodläsning plus DOM-kontroll av bryggan. Kvar som backlog, inte som plan: plan-lägets godkänn-kort renderas bara i `?debug=1`, och `contractAuthProvider` fastnar i snapshot-sanitizerns sensitive-regex. |
| **shadcn-registry + "Beskriv"-komposition** (2026-07-22) | Fas 0–6 första leverans: pin/spike #570 · MessageScroller #572 · Bläddra/"Lägg till" #574 · describe API #576 · insert-lane + Beskriv #581/#583 · sökdriven recipes #582 · `@sajtmaskin`-registry proof #584 · status-sync #585 · slutstabilisering #586 (historikankare + provider-failover). Detalj: [`2026-07-22-shadcn-registry-beskriv-komposition.md`](2026-07-22-shadcn-registry-beskriv-komposition.md). | Valfritt backlog: Fas 2 v2 deterministic recipe-lane; expansion av `@sajtmaskin`-katalog; BB#shadcn-lane1 (riktigt sendMessage-utfall). Drag-n-drop för registry-insert + thumbnail-fix (shadcn-bildvägen flyttad till `new-york`) levererades 2026-07-24. |

## Kvar som filer (fortsatt referensvärde)

**Kod-/contract-citerade planer** (länkade från källkod — radera inte utan referensmigrering):

- [`2026-06-19-inspector-rendering-arkitektur.md`](2026-06-19-inspector-rendering-arkitektur.md) — `docs/ENV.md`, `inspect-bridge-*.ts`
- [`2026-06-27-server-verify-distributed-lock.md`](2026-06-27-server-verify-distributed-lock.md) — `db/schema.ts`, `chat-repository-pg.ts`, migration
- [`2026-07-08-dossier-legacy-import.md`](2026-07-08-dossier-legacy-import.md) — `docs/contracts/dossier-system.md`
- [`repair-loop-hardening.md`](repair-loop-hardening.md) — `docs/contracts/fixer-registry.md`
- [`P30-r3f-tuple-and-repair-feedback.md`](P30-r3f-tuple-and-repair-feedback.md), [`P31-feature-runtime-envs-and-f3-toggle.md`](P31-feature-runtime-envs-and-f3-toggle.md) — `fixer-registry.ts`, `autofix/pipeline.ts`
- [`SEO-F3-PROMOTION-NEXT-PR.md`](SEO-F3-PROMOTION-NEXT-PR.md) — `projects/preferences-schema.ts`
- [`2026-07-22-shadcn-registry-beskriv-komposition.md`](2026-07-22-shadcn-registry-beskriv-komposition.md) — `shadcn-insert.ts`, `describe*.ts`, add-panel/Beskriv UI, `docs/ENV.md`, recipe-search-tester

**Test-citerad invariant-provenance** (`Källa:`-referens från stabilitetssviten) i
[`grandmaster/`](grandmaster/): `02-stabilitetstester.md`, `07-false-green-hardning.md` och
`aktiviteter/{S2,S3,A7-1,A7-2,5-3,5-5,C2}.md`. Rör dessa bara om motsvarande
`*.stability.test.ts`-invariant ändras.

## Operativ sanning (inte här)

Aktuell arkitektur och körflöde: [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md)
(§ FAS 2 orchestration/build, § FAS 3 preview/deploy). När en äldre plan inte finns som fil:
behandla detta index som pekare och använd git-historik.
