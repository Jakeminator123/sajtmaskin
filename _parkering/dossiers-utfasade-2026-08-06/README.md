# Utfasade dossiers (2026-08-06)

Fyra hard-dossiers parkerade vid dossier-förenklingen (ägarens fria-händer-uppdrag
2026-08-05): noll selektioner i prod sedan telemetrin började (2026-07-03,
`generation_telemetry.meta.selectedDossierIds`), noll lastbärande kodreferenser
utanför testfixturer, och samtliga utom plausible låg som `unverified`/gammal
`lastVerified` i underhållsgrinden. Att de låg kvar kostade veckovis
acceptans-CI, freshness-underhåll och kuratorsyta utan att någon användare
någonsin träffat dem.

**Parkerade:** `sentry-error-tracking` (error-tracking), `plausible-analytics`
(analytics-syskon; `vercel-analytics` kvarstår som ensam provider),
`fal-image-generation` (image-generation), `ably-realtime` (realtime).

- Runtime läser bara `data/dossiers/{hard,soft}/` — inget här laddas.
- Capabilities `error-tracking`, `image-generation` och `realtime` är borttagna
  ur follow-up-vokabulär, brief-prompt, capability-bridge/inference och
  grupp-mappningen. `analytics` finns kvar (vercel-analytics). En gammal
  snapshot som ännu bär ett utfasat capability-id selekterar tyst ingenting
  (befintligt beteende för okända capabilities), och ett F3-godkännande av
  providern går den generiska LLM-vägen (`providerKeysWithoutBackingDossier`).
- Kan raderas helt när som helst — git-historiken har originalen
  (`data/dossiers/hard/<id>/`).
- Återinförande: flytta tillbaka mappen, återställ vokabulär/brief/bridge-raderna
  och kör `npm run dossiers:validate-all` + capability-map-rebuild.
