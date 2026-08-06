# Utfasade dossiers (2026-08-06)

Sju hard-dossiers parkerade vid dossier-förenklingen (ägarens fria-händer-uppdrag
2026-08-05): noll selektioner i prod sedan telemetrin började (2026-07-03,
`generation_telemetry.meta.selectedDossierIds`), noll lastbärande kodreferenser
utanför testfixturer/den egna specialmekaniken, och flera låg som
`unverified`/gammal `lastVerified` i underhållsgrinden. Att de låg kvar kostade
veckovis acceptans-CI, freshness-underhåll och kuratorsyta utan att någon
användare någonsin träffat dem.

**Parkerade (etapp 1):** `sentry-error-tracking` (error-tracking),
`plausible-analytics` (analytics-syskon; `vercel-analytics` kvarstår som ensam
provider), `fal-image-generation` (image-generation), `ably-realtime`
(realtime).

**Parkerade (etapp 2):** `paddle-billing` (subscriptions). Tog med sig
systemets enda dossier-beroende: `DEPENDENT_CAPABILITIES`-posten
`subscriptions` ⇒ `auth` pinnad till supabase-auth är borttagen ur `select.ts`,
liksom `needsSubscriptions`-inferensflaggan, money-flow-dedupen
subscriptions/payments och removal-/negations-vokabulären för prenumerationer.
Engångsbetalning (`payments`/stripe-checkout) är opåverkad.

**Parkerade (etapp 3):** `neon-postgres` och `mongodb-atlas` (database-syskon).
Aldrig selekterade i prod; `postgres-drizzle` är ensam dossier under
`database`. En Neon-Postgres-connection-string fungerar med `pg`-drivern i
postgres-drizzle — separat Neon-dossier gav ingen extra yta. Mongo-/Neon-
vokabulären i follow-up och brief behålls som triggers för capability
`database` (en MongoDB-ask är en databas-ask; implementationen är vår sak).

- Runtime läser bara `data/dossiers/{hard,soft}/` — inget här laddas.
- Capabilities `error-tracking`, `image-generation`, `realtime` och
  `subscriptions` är borttagna ur follow-up-vokabulär, brief-prompt,
  capability-bridge/inference och grupp-mappningen. `analytics` finns kvar
  (vercel-analytics). `database` finns kvar med `postgres-drizzle` som ensam
  provider. En gammal snapshot som ännu bär ett utfasat capability-id eller
  parkerat dossier-id selekterar tyst ingenting (befintligt beteende för
  okända capabilities/dossier-ids), och ett F3-godkännande av `mongodb`/
  `neon` går den generiska LLM-vägen (`providerKeysWithoutBackingDossier`).
  Pool: 22 → 20 (11 hard + 9 soft).
- Kan raderas helt när som helst — git-historiken har originalen
  (`data/dossiers/hard/<id>/`).
- Återinförande: flytta tillbaka mappen, återställ vokabulär/brief/bridge-raderna
  och kör `npm run dossiers:validate-all` + capability-map-rebuild.
