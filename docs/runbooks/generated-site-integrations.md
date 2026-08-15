# Felsök genererade integrationer

Den här runbooken gäller Byggblock som har både en synlig yta och en riktig
serverfunktion, till exempel AI-chatt, kontaktformulär, nyhetsbrev och checkout.
OpenAI-chatten som först avslöjade felet är ett exempel; kontrakten är generella.

## Förväntat flöde

1. Designversionen kan visa ett ärligt demoläge.
2. Användaren väljer Byggblock och kör **Bygg integrationer**.
3. En separat integrationsversion materialiserar dossierns server- och klientfiler.
4. Projektvärden som `OPENAI_API_KEY`, `RESEND_API_KEY` eller
   `CONTACT_EMAIL_TO` injiceras i preview-runtimen.
5. Varje Byggblock rapporterar sitt eget läge: `Inte byggd än`, `Demo`,
   `Nyckel krävs`, `Live` eller `Klar`.

`design`/`integrations` är versions- och verifieringslanes. De är inte ett
mognadsbetyg på hela sajten. En AI-chatt kan vara live samtidigt som ett annat
hårt Byggblock fortfarande kör demo.

## Incidenten: nyckeln fanns men `/api/chat` gav 404

Den sparade OpenAI-nyckeln var inte kärnfelet. Den hade nått projektets
runtime-env. Dossierns klient skickade däremot ett normalt, deploy-portabelt
anrop till `/api/chat`, medan Fly-previewn multiplexar varje sajt under
`/{chatId}`. Browsern lägger inte Nexts `basePath` på `fetch()` eller AI SDK:s
transport-URL. Preview-hosten läste därför `api` som ett chat-id och svarade
404 innan den genererade Next-routen eller OpenAI nåddes.

Den permanenta fixen ägs av preview-proxyn: en root-absolut `/api/*`-request
med en giltig iframe-Referer kopplas till samma previewsession och skickas
uppströms som `/{chatId}/api/*`. Metod, body, querystring och Origin bevaras.
Utan Referer gissar proxyn aldrig en session. Vanliga sidpaths omfattas inte,
så verkliga 404:or maskeras inte.

Detta löser samma felklass för browserinitierade `fetch`-, formulär- och
SDK-anrop från alla nuvarande Byggblock; ingen providerlista och ingen
OpenAI-specialregel behövs. Det är inte ett scope-kontrakt för externa
callbacks, server-till-server-anrop eller requests utan sidans Referer. Sådana
anrop måste använda den redan scopade preview-URL:en `/{chatId}/api/*` (eller den
vanliga root-URL:en efter publicering).

## Env-kontraktet

Projekt-env är en separat kedja från routing:

```text
Byggblock / env-API
  → project_data.meta.projectEnvVars
  → preview-VM .env.local
  → inline env vid deploy + krypterad Vercel-projektsynk
```

- API:t accepterar godtyckliga giltiga `UPPER_SNAKE_CASE`-namn.
- Känsliga värden lagras krypterat och visas maskerade.
- Preview-runtime får hela projektets konfigurerade env-map; den filtreras inte
  till OpenAI eller till valda dossiernycklar.
- Deploy skickar samma map både till den aktuella deployen och till
  Vercel-projektet för framtida ombyggen.
- `env.example` är bara en mall med nyckelnamn. Sparade projektvärden laddas
  eller dekrypteras aldrig på den persistenta filvägen.
- Att spara en nyckel bygger ingen kod. Det kan göra en redan byggd funktion
  live efter preview-omstart; saknas dossierfiler måste **Bygg integrationer**
  köras först.

## Vad kontrollerna bevisar

| Signal | Bevisar | Bevisar inte |
| --- | --- | --- |
| TypeScript/build grönt | Filsnapshoten kompilerar och kan byggas | Att en knapp har använts i browsern |
| Preview ready | Next-runtimen svarar för sajten | Att varje extern provider godkänner en nyckel |
| Product Postcheck | En begränsad DOM-/runtime-kontroll av previewn | Ett verkligt AI-svar eller varje capability-interaktion |
| Byggblock `Live` | Dossierfilbevis + konfigurerade runtimevärden | Att en publicering har skett |
| Publicering | Den valda versionen har deployats | Att alla andra Byggblock är live |

Product Postcheck frågar preview-hostens readiness (`readinessState` /
`httpReady` på `GET /preview/session/:id/status`) innan den slår fast att
sajten inte är klar. En äkta startsida (`preview_boot_page`) blockerar; ett
tomt eller oläsbart Chromium-svar (`preview_probe_unreadable`) gör det inte
och skyller inte på hosten. Den ska förbli en sammanhållen, browsernära
kontroll — inte växa till en ny parallell verifieringskedja.

## Snabb felsökning

1. Kontrollera Byggblockets status och exakt aktivt `versionId`.
2. Kontrollera att den kanoniska dossier-routen finns i versionens filer.
3. Verifiera preview-pathen: en browserrequest till `/api/x` ska nå
   `/{chatId}/api/x` uppströms.
4. Kontrollera att projektvärdet finns i den maskerade env-statusen och i
   preview-runtime, aldrig genom att skriva ut själva värdet.
5. Läs TypeScript/build-fel separat från provider-/runtimefel.
6. Testa publicering först när previewkontraktet är grönt.

SEO-advisories var inte orsak till den här felklassen. SEO-polish granskas och
läggs på genom det befintliga valet **Optimera för Google** vid publicering,
inte efter varje designversion.

Supabase-felet `column "repair_state" does not exist` i den ursprungliga
utredningen kom från en tillfällig read-only diagnostikfråga mot två
icke-existerande kolumner. Frågan stoppades vid SQL-parse och hade ingen
koppling till env, kryptering eller chatten.

## Regressioner som måste vara gröna

- Preview-proxy: root-absolut POST `/api/*` med Referer bevarar path, query,
  metod och body; samma request utan Referer ger 404.
- Env: godtyckliga projektvärden når både inline-deploy och
  Vercel-projektsynk, medan värdena saknas ur `env.example`.
- Dossier: kanonisk materialisering passerar TypeScript och Next-build.
- Product Postcheck: readiness frågas; äkta startsida blockeras; tomt svar
  skyller inte på preview-hosten.

Kanoniska owners:

- [`../../preview-host/src/runtime/preview-proxy.js`](../../preview-host/src/runtime/preview-proxy.js)
- [`../contracts/env-flow.md`](../contracts/env-flow.md)
- [`../concepts/f2-and-f3.md`](../concepts/f2-and-f3.md)
- [`../schemas/preview-session-contract.md`](../schemas/preview-session-contract.md)
- [`../../src/lib/gen/dossiers/`](../../src/lib/gen/dossiers/)
