# D2 — `configInputs` och `providerSetup` i dossier-schemat

Beror på: inget. Först i kedjan.
Blockerar: [D3](D3-harddossierintegration.md).

## Problemet

Ett hard-dossier kräver två olika saker av användaren, och i dag är de blandade i
samma platta fält:

1. **Värden som ska in i appen** — env-nycklar, pris-id:n, projekt-id:n. De hamnar
   i `envVars[]` tillsammans med sin `purpose`-text.
2. **Handgrepp hos leverantören** — slå på en inloggningsmetod hos Supabase, lägga
   en callback-URL i redirect-allowlisten, verifiera en domän hos Resend, skapa en
   innehållstyp i Sanity Studio. De finns i dag bara som prosa i `summary` eller
   `instructions.md`, om de finns alls.

#1045 rättade texterna men flyttade inte gränsen. Konsekvensen är att UI:t inte kan
skilja «fyll i det här fältet» från «gör det här i en annan flik», och att
byggmodellen får båda som odifferentierad text.

## Uppgiften

Inför två fält i dossier-manifestets schema:

- `configInputs` — det användaren fyller i hos oss. Strukturerat nog att en UI-yta
  kan rendera det utan att gissa: nyckel, etikett, om det är hemligt, om det är
  obligatoriskt, och var värdet hämtas.
- `providerSetup` — stegen användaren gör hos leverantören. En ordnad lista av
  korta, verifierbara handgrepp.

Båda ska vara **valfria** i schemat, så de nio befintliga manifesten fortsätter
validera medan de fylls i efterhand. Fyll i dem för de dossiers där #1045 redan
skrev ner handgreppen i prosa — `supabase-auth`, `sanity-cms`, `stripe-checkout`,
`clerk-auth`, `postgres-drizzle` — och lämna resten tomma.

## Två sanningar bredvid varandra — undvik det

`envVars[]` är i dag **inte** schema-only. Den läses i runtime av registry
(`registry.ts:112`), `isConfigured` (`select.ts:197-205`), `dossierRequiresF3`
(`types.ts:233-234`), lifecycle/readiness (`lifecycle.ts:130-191`), katalog-API:t
(`catalog/route.ts:39-44`), overview-detektorn (`dossier-overview.ts:117-145`) och
capability-map-generatorn (`regenerate-capability-map.ts:95-99, 228-249`).

`configInputs` beskriver delvis samma sak: värden användaren fyller i hos oss.
Införs fältet utan att någon läser det får vi två beskrivningar av samma fråga och
ingen ägare — precis den klass av problem som `SM-046` (`deploy-assistant`
konfigurerad utan anropare) redan kostat oss.

Därför krävs ett av två i den här PR:en, uttryckligen skrivet i PR-bodyn:

- **Antingen** minst en runtime- eller UI-konsument som faktiskt läser
  `configInputs`, så fältet har en anropare från dag ett,
- **eller** en explicit rad i `docs/contracts/dossier-system.md` att fältet är
  _schema-only i väntan på D3_, med `envVars` som fortsatt enda sanning för
  `configured`-frågan.

Att lämna frågan obesvarad är inte ett tredje alternativ.

## Gränser

- **Ändra inte** `envVars[]`-kontraktet i den här aktiviteten. `isConfigured()`
  (`src/lib/gen/dossiers/select.ts`) grenar på `required`, och #1045 justerade just
  den semantiken för Stripe. Att flytta nycklar till `configInputs` samtidigt gör
  två saker på en gång och blir omöjligt att granska.
- **Rör inte** promptblocken. Det är D3.
- **Rör inte** `SELECTED_SECTION_CHAR_CAP`.
- Kopiera inte enumlistor eller defaults till en ny handskriven doc-yta — kör
  `npm run docs:generate` och låt projektionen bära dem.

## Klart när

- Schemat accepterar båda fälten, och `npm run dossiers:validate-all` är grön för alla 18.
- De fem dossiers som har handgrepp i prosa har dem även i `providerSetup`, med samma innebörd — inte utökad.
- Ett test låser att ett manifest utan fälten fortfarande validerar.
- `configInputs` har antingen en läsare eller en skriven schema-only-status. Ingen andra sanning bredvid `envVars`.
- Hela verifieringslistan i [styrdokumentet](../00-master-plan.md#verifiering-per-ändring) är grön.

## Agentprompt

> Du arbetar i Sajtmaskin. Läs först `AGENTS.md`,
> `docs/contracts/dossier-system.md`, `övrigt/FUSKLAPP-BYGGBLOCK.md` och
> `.cursor/rules/workflow.mdc`. Läs sedan
> `docs/plans/active/2026-08-19-dossier-forenkling/00-master-plan.md` — det äger
> spårets gränser — och den här filen.
>
> Uppgift: inför `configInputs` och `providerSetup` som valfria fält i
> dossier-manifestets schema, och fyll i `providerSetup` för de fem dossiers som
> redan beskriver leverantörssteg i prosa (`supabase-auth`, `sanity-cms`,
> `stripe-checkout`, `clerk-auth`, `postgres-drizzle`). Innebörden ska vara
> oförändrad — du översätter prosa till struktur, du hittar inte på nya krav.
>
> Rör inte `envVars[]`-semantiken, promptblocken eller
> `SELECTED_SECTION_CHAR_CAP`. Manifesten är kanonisk källa; uppdatera validatorn
> bara om kontraktet kräver det.
>
> Verifiering (allt måste vara grönt): `npm run dossiers:validate-all`,
> `npm run dossiers:capability-map:write`, `npm run docs:generate`,
> `npm run docs:check`, `npm run docs:links`, `npm run typecheck`,
> `npx vitest run src/lib/gen/dossiers`.
>
> Följ `.agents/skills/pr-workflow/SKILL.md`: kör `npm run verify:pr`, därefter
> ett oberoende readonly Sol-pass på slutdiffen. Lämna EN draft-PR mot `master`
> med en body som säger vad som ändrats och varför. **Merga inte**, och sätt inte
> `merge:ready` förrän varje fynd är triagerat på aktuell head-SHA.
