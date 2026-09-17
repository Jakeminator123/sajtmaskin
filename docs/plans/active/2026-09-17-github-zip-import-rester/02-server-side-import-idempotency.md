# Separat PR – server-side import-idempotens

## Varför

#1433 levererade inte full server POST-idempotens. Klientlåset räcker inte
när servern skapat importen men svaret tappas och klienten gör om requesten.

## Mål

Ett logiskt importförsök får en idempotency key. Samma user/tenant + key
konvergerar till samma `projectId` / `chatId` / `versionId` utan ny creation
eller ny debitering. Samma repo får importeras två gånger avsiktligt med
olika keys.

## Krav

- tenant/user-binding
- bounded TTL/receipt
- atomisk claim/fence (inte `SELECT` sedan create)
- parallella requests med samma key skapar exakt ett projekt
- lost response → retry samma IDs
- preview-failure efter persist + retry skapar inte nytt
- credits committeras inte två gånger
- annan user får inte återanvända receipt

## DB

Undersök först template-init-claim och `transactions.idempotency_key`.

Om ny migration krävs: skapa/apply den **inte** på eget initiativ. Rapportera
minimal schemaförändring och vänta på ägarbeslut. Preview och production
delar Postgres.

## Status i denna kod-PR

Inte implementerad. Befintliga mönster räcker inte för importens
project/chat/version-kvitto utan en ny claim-tabell eller utökad
operation-tabell. Residual — egen PR, blanda inte in binary-assets.
