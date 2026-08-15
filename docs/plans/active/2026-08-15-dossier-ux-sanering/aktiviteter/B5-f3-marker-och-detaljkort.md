# B5 — F3-markern tappar env-nycklar + detaljkortet räknar för tidigt (SM-008, SM-009)

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Två öppna backlograder i samma F3-kvartersflöde:

- **`SM-008`:** continuation-markern (`buildF3AwaitingInputUiPart` i
  `src/lib/gen/stream/f3-continuation.ts`, skrivs från `generation-stream.ts`)
  bär `suggestedProviders` men inte env-nyckellistan. Efter reload/approve vet
  ett env-only-förslag inte längre vilka nycklar det bad om.
  (`requestedEnvKeys` finns i dag inte alls i koden — tool-SSE:n i
  `generation-stream-tools.ts` bär `envVars`, men markern tappar dem.)
- **`SM-009`:** det tidiga F3-detaljkortet räknar evidence på basversionens
  filer före finalize och kan visa «planerad» efter leverans i samma runda.
  Snapshot och panel är post-merge-korrekta; felet är kortets tidiga beräkning.

## Uppgift

- Persistera hela markern: provider **och** begärda env-nycklar; läs tillbaka
  dem i `resolvePendingF3Continuation`/approve-vägen.
- Låt detaljkortet räkna om samma lifecycleprojektion (`resolveDossierLifecycle`)
  på post-merge-filerna i stället för basfilerna, eller vänta in
  finalize-signalen innan status visas.

## Vad som INTE ingår

- Ingen ny statusmodell — samma fem `overviewStatus`-värden.
- Ingen ändring av approve-/avvisa-flödet i sig.

## Verifiering

- Test: env-only-förslag → reload → approve → nycklarna finns kvar i markern.
- Test: leverans i samma runda → detaljkortet visar inte «planerad».
- `npm run typecheck` + riktad vitest.

## Klart när

`SM-008` och `SM-009` avbockade i `BUG-SWARM-BACKLOG.md` med testlås.
