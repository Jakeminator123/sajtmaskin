# Kostnadsfri mail register

Sajtmaskins Postgres-databas är sanningskälla. `kostnadsfri_pages` är det
bakåtkompatibla företagsregistret; `kostnadsfri_mail_events` är den additiva
historiken med en rad per mejl. Historiska `post-scrape` och `render-mail-flow`
klassas inte om.

## Registrera ett accepterat mejl

`POST /api/kostnadsfri` kräver `x-api-key`. Det befintliga underlaget behålls.
Ett nytt utskick kan dessutom skicka:

```json
{
  "companyName": "Acme AB",
  "contactEmail": "hej@acme.example",
  "sentAt": "2026-10-03T08:30:00.000Z",
  "source": "render-mail-flow:text",
  "mailEvent": {
    "messageId": "0123456789abcdef0123456789abcdef",
    "flowId": "flow_123",
    "step": "first",
    "variant": "text",
    "sender": "hej@sajtmaskin.se",
    "recipient": "hej@acme.example",
    "scheduledAt": "2026-10-03T08:29:00.000Z",
    "smtpAcceptedAt": "2026-10-03T08:30:00.000Z",
    "deliveredAt": null,
    "repliedAt": null,
    "outcome": "accepted"
  }
}
```

`messageId` är de 32 hextecknen från
`sha256("render-mail-flow-v1:" + flowId + ":" + jobId).slice(0, 32)`.
Samma id och samma fakta är idempotent (`duplicate`). Samma id med andra fakta
ger 409. Samma oförändrade mejl får bara gå framåt: `scheduled` →
`uncertain`/`failed` → `accepted`; acceptans kan inte rullas tillbaka och
`uncertain` och `failed` byter inte till varandra (409). `step=follow` skapar en ny mejlrad men ändrar inte företagets
ursprungliga `sentAt` eller `source`. Ett senare `step=first` (nytt flöde)
skriver inte heller över ett redan registrerat `sentAt/source`. `sentAt` betyder SMTP-acceptans i det
bakåtkompatibla registret, inte första utskicket och inte leverans.

Förberedelse utan SMTP-acceptans ska inte skicka `sentAt`, variantsource eller
`smtpAcceptedAt`. Ett `scheduled`, `uncertain` eller `failed` `mailEvent` får
registreras utan de fälten; eventsraden bär då sin variant men företagsregistrets
`sentAt/source` lämnas orörda. Leverans och svar är separata senare utfall och
får inte gissas ur acceptansen. När de finns skrivs de i `deliveredAt` och
`repliedAt`; de ändrar inte innebörden av `smtpAcceptedAt`.

## Läsning

`GET /api/kostnadsfri` behåller de credential-fria företagsfälten och lägger
till `generation`, `registry`, `analytics` och `generation.available`.
Analysfel ger `visits`, `verified` och `started` som `null`, aldrig falska nollor.
`analytics.complete=false` betyder att värdena är en undre gräns.

Defaultläsningen behåller tidigare ordning och högst 2 000 rader. En komplett,
stabil id-ordnad läsning börjar med `?cursor=0&limit=500` och följer
`registry.nextCursor` tills `registry.complete=true`. `registry`, `analytics` och
`generation` valideras som en del av kontraktet: `complete=false` har alltid
en `nextCursor`, `complete=true` aldrig, och otillgänglig analys kan inte vara
`complete`. Om defaultläsningen
kapas (`complete=false`) är `registry.nextCursor` `"0"`: legacyordningen kan
inte återupptas, så konsumenten läser om hela registret i id-ordning och
deduplicerar på `slug`.

`GET /api/kostnadsfri/mail-events?limit=500` läser enskilda mejl i stigande
skapelseordning. Följ dess opaka `nextCursor` tills `complete=true`. Markören
bär `created_at` med mikrosekunder plus `messageId`, så sista raden upprepas
aldrig och rader med samma tidsstämpel hoppas inte över. En markör med bara
millisekunder, eller ett datum som inte finns (t.ex. `2026-02-31` eller år
`0000`, som PostgreSQL saknar), avvisas med 400.

Ett `mailEvent` för ett företag som har avregistrerat sig ger 409, både
`step=first` och `step=follow`. När `POST` skapar en ny sida med `mailEvent`
sparas sidan och mejlraden i samma transaktion; ett redan registrerat
`messageId` ger 409 och ingen ny sida.
För en befintlig sida låses företagsraden och avregistreringen läses om i samma
transaktion som mejlraden skrivs, så en samtidig avregistrering kan inte
smita förbi kontrollen.
Företagets `sentAt/source` fylls i samma låsta transaktion och bara medan
`sent_at` är tomt, så två samtidiga första mejl kan inte skriva över varandras
kohort. Kontaktadress och profil är separat företagsmetadata: varje accepterat
mejl (`first` eller `follow`) får uppdatera dem under samma lås och
avregistreringskontroll, utan att röra `sentAt/source`. En konflikt eller en
avregistrering ändrar ingenting. A/B-nämnaren `firstAccepted` räknar företag
med minst ett accepterat första mejl, i den kohort som företagsradens bevarade
`source` anger. Varje företag räknas en
gång oavsett i vilken ordning dess mejl accepterades; alla mejlrader behålls.
Admin visar generationsantal från det visade företagsregistret separat från
eventregistrets accepterade förstamejlsföretag. Historik utan mailEvent och
ett eventuellt kapat företagsregister gör dessa underlag olika; de presenteras
inte som en konverteringskvot. När analysen är otillgänglig inaktiveras
besöks-/verifierings-/formulärfilter i stället för att behandla okända tal som noll.

`generation.state` är `unknown`, `not-started`, `in-progress`, `succeeded`
eller `failed`. `completedAt` finns bara för `succeeded`; `siteId` är projektets
interna id. Saknat eller ogiltigt generationsfält degraderas till `unknown`
utan att utskicksraden underkänns. `started` betyder fortfarande att en
prompt-handoff skapades, inte att en sajt genererades.

## Säker korrelation

Länken får bära `mail_id` och `variant=rent|animated`, men de är inte
behörighet eller leveransbevis. Vid korrekt lösenord kontrollerar servern att
`mail_id` är ett accepterat event för samma slug innan id:t signeras in i det
befintliga kampanjkvittot. Projekt-, chat- och versionsbindningen görs därefter
från kvittot. Ett gissat eller ändrat queryvärde utelämnas och kan inte skapa
en kampanjbindning eller lyckad generation.

Fixture för isolerade konsumenttester:
[`docs/mail-register-contract.fixture.json`](../mail-register-contract.fixture.json).
