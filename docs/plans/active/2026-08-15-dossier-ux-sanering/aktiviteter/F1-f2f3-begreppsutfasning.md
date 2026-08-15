# F1 — F2/F3 fasas ut som begrepp (användarytor, docs, regler)

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Bakgrund och beslut

Ägarbeslut D5 (2026-08-15): F2/F3 som **begrepp** försvårar mer än de hjälper
och ska suddas ut medvetet. Regler får ändras. De interna lanes:en behålls —
det som utfasas är orden, inte mekaniken (design-preview kontra
integrationsbygge är fortfarande två kontrakt med olika gates).

Terminologiregeln gäller: kodidentifierare, telemetri-nycklar och DB-strängar
(`fidelity2`/`fidelity3`, `lifecycleStage: "integrations"`,
`dossierRequiresF3()`, `designPreview`/`integrationsBuild`) **behålls** och
mappas i text.

## Uppgift

1. **Inventera** användarsynliga F2/F3-strängar: version-history-etiketter
   (`version-history-view.tsx` ~401), tooltips runt integrationsbygget,
   readiness-/statuscopy, backoffice-kolumner (`requires_f3`-etiketter).
2. **Ersätt** med vardagsspråk: «designversion» / «integrationsversion»,
   «Kräver integrationsbygge» i stället för «Kräver F3».
3. **Docs:** skriv om `docs/concepts/f2-and-f3.md` till lane-beskrivning med de
   nya orden (F2/F3 blir legacy-alias); uppdatera glossaryns rader (F2/F3,
   «Kräver F3 (dossier)», namnskuggan «tier 2/tier 3») och
   `FUSKLAPP-BYGGBLOCK.md`.
4. **Regler:** uppdatera ordvalen i `.cursor/rules/` där F2/F3 används som
   användarbegrepp (bl.a. `env-flow-f2-mute.mdc`, review-flaggan i `AGENTS.md`
   «F2/F3-status som blir grön …», `sajtmaskin-context`-skillen). Regelns
   innebörd behålls — bara språket byts.
5. **Genererade docs:** kolumnrubriker («F2», «F3/build-server») via
   generatorerna, inte handredigering.

## Ordning

Körs **sist** i spåret så att de nya orden landar på redan konsoliderade ytor
(K1/U1/M1) i stället för att döpa om ytor som ändå ska bort.

## Vad som INTE ingår

- Inga kod-/schema-renames, inga telemetri-nyckelbyten, ingen DB-migration.
- Ingen semantikändring i gates eller mute-policy.

## Verifiering

- `npm run docs:generate` + `npm run docs:check` + `npm run docs:links`.
- Terminologikontrakt: `scripts/docs/check-terminology-contract.mjs`.
- `npm run typecheck` + snapshot-tester där UI-strängar rörs.
- Grep-svep: användarsynliga «F2»/«F3» kvar endast där de är medvetna
  legacy-alias.

## Klart när

En användare möter aldrig orden F2/F3; agenter hittar mappningen
gamla↔nya ord i glossaryn; reglerna beskriver samma mekanik med nya ord.
