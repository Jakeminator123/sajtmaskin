# Cursor Cloud Agent — pod-specifika förutsättningar

Gäller Cloud-podar, inte lokal Windows-utveckling. För vanlig setup och
lokal preview-host: [lokal generation](local-dev-generation.md).
Denna guide beskriver skillnaderna; den kopierar inte det gemensamma receptet.

## Runtime och installation

Node-versionen ägs av [package.json](../../package.json) och snapshoten av
[Dockerfile](../../.cursor/Dockerfile). Kontrollera faktisk `node --version`;
en gammal eller just-in-time-pod kan sakna den förväntade installationen.

Kör från repo-roten:

```sh
npm ci --no-audit --no-fund
npm run hooks:install
npm run verify:pr -- --plan
```

[environment.json](../../.cursor/environment.json) äger installation/start.
En startad app bevisar inte att databas, provider eller preview-host fungerar.
Preview-hosten har egna dependencies och startkommando; använd det
[gemensamma receptet](local-dev-generation.md#isolerad-lokal-preview-valfritt-mer-setup).

## Injicerad miljö

- Poden kan sakna secrets. Kontrollera att nödvändiga nycklar finns utan att
  skriva ut värden. Kopiera inte en annan miljös hemligheter som standardåtgärd.
- Processmiljön har företräde framför `.env.local`. En ändring i filen
  ersätter inte en redan injicerad variabel; starta rätt process med avsedd
  miljö och kontrollera vilket konto/DB-mål den faktiskt använder.
- Kvot, modellåtkomst och hosthälsa måste verifieras för den aktuella körningen.
  Ett gammalt kontos 429-fel innebär inte att en provider generellt är ur drift.
  Aktuella modellval ägs av [modellmanifestet](../../config/ai_models/manifest.json).
- Enhetstester ska använda sina avsedda fixtures/mocks. Om injicerade
  provider-/Redis-variabler påverkar ett test, jämför riktat med endast dessa
  variabler borttagna ur testprocessen. Tysta inte fel eller klassificera dem
  som gamla miljöfel utan reproducerbart bevis.

## Databas och konton

Verifiera DB-identitet med `npm run db:check-target -- --expect=dev` före
DB-beroende arbete. Cloud start och dev-start gör read-only schema-kontroller;
de ger inget mandat till DDL, datareparation eller kreditändringar.

En ny uttryckligen beställd throwaway-DB och en befintlig delad DEV är olika
mål. Följ [DB-runbooken](db-migrations.md); kör inte `db:init` som
felsökningsförsök mot en befintlig databas.

TLS-fel ska diagnostiseras mot faktisk anslutning och certifikatkedja. Sänk
inte verifiering slentrianmässigt. Tillåtna miljöval och deras begränsningar
beskrivs i [datakontraktet](../contracts/data-layer.md) och [ENV](../ENV.md).

Generation kräver rätt konto och explicit sändning från buildern.
Testkonton och credits följer aktuella auth-/miljöregler; använd inte
ad hoc-SQL eller ändrade adminlistor utan separat mandat.

## Python och verifiering

Podinstallationen använder
[ensure-backoffice-python.mjs](../../scripts/dev/ensure-backoffice-python.mjs).
Kontrollera dess faktiska resultat: saknad pip kan ge en rapporterad skip,
vilket inte betyder att Python-tester har körts.
[requirements.backoffice.dev.txt](../../requirements.backoffice.dev.txt)
äger testberoendena. `npm run backoffice:test` kör testsviten.

Kör relevanta kontroller enligt planen och redovisa utfört, skippat och
blockerat separat. En historisk grön svit, lyckad serverstart eller genererade
filer bevisar inte fungerande live-preview. Använd [liveverifiering](live-verifiering.md)
för sådana påståenden.
