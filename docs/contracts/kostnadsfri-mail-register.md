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
ger 409. Samma oförändrade mejl får monotont gå från `scheduled`, `uncertain`
eller `failed` till `accepted`; acceptans kan inte rullas tillbaka. `step=follow` skapar en ny mejlrad men ändrar inte företagets
ursprungliga `sentAt` eller `source`. `sentAt` betyder SMTP-acceptans i det
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
`registry.nextCursor` tills `registry.complete=true`.

`GET /api/kostnadsfri/mail-events?limit=500` läser enskilda mejl i stigande
skapelseordning. Följ dess opaka `nextCursor` tills `complete=true`.

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
