# M1 — Strukturerad materialisering ersätter syntetisk prompt (+ knappens öde)

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Integrationsbygget är i dag en förklädd chatt-follow-up:

- «Bygg integrationer» → `POST …/finalize-design` → vid `llm_ready` auto-skickas
  den syntetiska användarprompten
  `"Bygg integrationer nu utifrån den finaliserade designversionen."` med
  `meta.lifecycleStage: "integrations"` (`use-preview-layout.ts` ~134–146).
- Requesten bär **inte** capability, dossier-id, provider, placering eller
  env-status — allt återskapas server-side ur snapshot, markers och
  projektstore. Samma fritext **utan** meta stannar i F2 (golden-testat).
- Den syntetiska texten visas som en användarbubbla; tillsammans med
  «Deep brief: på»-ekot ser det ut som ett nytt brief-/follow-up-projekt
  (ägarens exakta UX-klagomål).
- Två dörrar till samma sak: lila knappen och stream-flaggan.

## Uppgift

Utred och inför en **strukturerad operation** (arbetsnamn
`materialize_integration`) som den enda LLM-vägen in i integrationsbygget:

- Parametrar: project/version, capability, exakt dossier-id, provider,
  placering (från K2), env-readiness, approvals.
- Ersätter den syntetiska användarbubblan med en tydlig systemhändelse i
  chatten («Integrationsbygge startat: AI-chatt (OpenAI)») — användaren ska
  aldrig se en prompt hen inte skrivit.
- Den deterministiska vägen (exact-file-fork + ReleaseGate när inget behöver
  byggas) behålls orörd.
- Idempotens: retry får inte dubblera filer/dependencies eller byta provider.

**Knappen (ägarbeslut D4):** «bärande eller bort». Rekommendation: ta bort den
fristående lila knappen; materialisering triggas per block (eller «bygg alla»)
från Byggblock-ytan när kraven är gröna, och kan auto-startas när provider +
obligatorisk konfiguration är komplett — auto-start är ett explicit ägarval i
`/818`-rundan.

## Ordning

1. `/818`-svärm på beslutsfrågan (operation vs fortsatt prompt; knappens öde;
   auto-start ja/nej).
2. Implementera kärnan; migrera F3-kicken; behåll kompatibilitet för gamla
   snapshots/markers (`mutedDossierIds`, `f3Approved*` läses som i dag).
3. Radera den syntetiska promptvägen när operationen bevisats (ingen
   dubbeldrift kvar).

## Vad som INTE ingår

- Inga nya providers/dossiers.
- Ingen ändring av ReleaseGate-kraven eller env-enforcement-nivåerna.

## Verifiering

- Stream-/golden-tester för operationen; idempotens-test (dubbel trigger →
  en version); regressionstest att fritext aldrig kan starta F3 av misstag.
- `npm run typecheck` + riktade tester; docs + backoffice-synk per
  housekeeping-kontraktet.

## Klart när

En enda auktoritativ materialiseringsväg finns; ingen syntetisk användarbubbla;
knappfrågan avgjord och genomförd; gamla vägen raderad.
