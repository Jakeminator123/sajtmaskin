# OpenClaw-gateway på Render

Den här runbooken är snabbvägen för Sajtagentens separata OpenClaw-gateway.
Detaljerad konfiguration och felkatalog finns i
[`../../infra/openclaw/DEPLOY_INFO.txt`](../../infra/openclaw/DEPLOY_INFO.txt).

## Första kontrollen

1. `GET https://<gateway>.onrender.com/health` ska ge HTTP 200.
2. Bootloggen ska visa `Config written`, den pinnade OpenClaw-versionen och
   rätt `controlUi.allowedOrigins`.
3. Vercel ska ha `OPENCLAW_GATEWAY_URL` mot den **live** gatewayn
   (`https://openclaw-sajtagenten.onrender.com` — en läsbar/non-sensitive rad
   på development, preview och production). Samma
   `OPENCLAW_GATEWAY_TOKEN` som Render, plus `IMPLEMENT_UNDERSCORE_CLAW=true`.
   Peka inte på `https://sajtagenten.onrender.com` — den tjänsten är
   suspended. En ny env slår igenom först efter ny Vercel-deploy.
4. `GET https://<appen>/api/openclaw/health` ska visa `readiness: "ready"`.
   Den kontrollen anropar autentiserat `/v1/models` och fångar både fel token
   och saknade agentmål; Renders `/health` är bara process-liveness.

`OPENCLAW_GATEWAY_URL` använder `https://` i Vercel. Dashboardens WebSocket-fält
använder `wss://`.

## Modellrouting och säker utrullning

Sajtagenten är en publik yta men gatewayn har tre interna agentmål:

| Spår | Agent-id | Render-modell | Thinking | Användning |
| --- | --- | --- | --- | --- |
| Snabb | `sajtagenten-fast` | `openai/gpt-6.2-sol` | `low` | Tips och enkla frågor |
| Normal | `sajtagenten-balanced` | `openai/gpt-6.2-sol` | `medium` | Begränsad kod-/filkontext |
| Stark | `sajtagenten` | `openai/gpt-6.2-astra` | `high` | Review, debug, full kontext och aktiva befogenheter |

Appen väljer bara agent-id. Provider/modell, fallbackkedjor och thinking ägs av
Render-konfigurationen. Om ett gammalt gatewaybygge saknar snabb-/normalagenten
gör appen en enda kompatibilitetsretry mot `sajtagenten`; 401, 429 och generella
fel retryas inte.

### Uppgradera en befintlig gateway

1. Spara tidigare modellvärden och kontrollera att den persistenta disken har en
   återställningspunkt före runtimebytet. Render bygger gatewayn från `master`.
2. När releasen med OpenClaw `2026.10.34` är tillgänglig på Render, använd de
   sex värdena i [Blueprinten](../../infra/openclaw/render.yaml) och deploya den
   versionen. Render behöver sin befintliga `OPENAI_API_KEY`.
3. Kontrollera bootloggen, appens `/api/openclaw/health` och gatewayns
   autentiserade `GET /v1/models`. De tre agent-id:na ovan ska finnas med
   prefixet `openclaw/`. Prova därefter ett kort anrop i varje spår med
   ett avsett testkonto. Modellistan verifierar bara att agentmålen finns.
4. På en ny installation, aktivera `OPENCLAW_MODEL_ROUTING_ENABLED=true` i
   den avsedda Vercel-miljön när de tre målen fungerar och deploya om appen.
   En befintlig installation med flaggan aktiverad fortsätter använda den.

Gatewayn använder varje agents `thinkingDefault`. Snabba interna hjälpanrop
har också en egen låg resonemangsnivå i den genererade konfigurationen.

## Dashboard-inloggning

Control UI är publikt nåbar. Inloggning är **token + engångsgodkännande av
webbläsaren**. Lösenordsfältet i rutan används inte — lämna det tomt.
Sajtagenten-chatten i appen påverkas inte; den går server-till-server med
samma token.

| Fält | Värde |
| --- | --- |
| Dashboard | `https://openclaw-sajtagenten.onrender.com` |
| WebSocket | `wss://openclaw-sajtagenten.onrender.com` |
| Token | Render → `openclaw-sajtagenten` → Environment → `OPENCLAW_GATEWAY_TOKEN` — **värdet**, inte namnet |

1. Klistra in tokenen. Tryck **Connect**.
2. När anslutningen stannar på `disconnected (1008): pairing required`:
   lämna fliken öppen. Rutan visar inte `requestId`. Kopiera inte `deviceId`
   därifrån — `approve` tar `requestId`, och `deviceId` ger
   `No pending device request matches`.
3. Render → samma tjänst → **Shell**. Hämta `requestId` med listan och
   godkänn det id:t:

   ```sh
   openclaw devices list --json
   openclaw devices approve <requestId>
   ```

   `requestId` är fältet på den väntande posten i listan, inte `deviceId`.
   Posten ska gälla `openclaw-control-ui`, rätt webbläsare och de
   operator-scopes du väntar dig. Godkänn bara det aktuella `requestId`.
4. Låt fliken vara öppen. Den ansluter själv när enheten är godkänd.
   **Connect** igen bara om den inte gör det. Profilen ligger därefter under
   `paired` på den persistenta disken.

Nästa gång i **samma** webbläsarprofil: bara token + Connect. Ny dator,
annan profil eller rensade sajtdata = nytt `requestId` och ny `approve`.

`list` tom eller `No pending device request matches`: Connect i webben först,
lista direkt, approve det **nya** id:t. Återanvänd aldrig ett id från en
gammal skärmbild. Lockout gäller fel token, inte pairing: tio felaktiga
tokenförsök inom 60 sekunder ger fem minuters spärr. En Connect med rätt
token räknas inte.

## Så läses de vanliga WebSocket-loggarna

| Logg                                            | Betydelse                                                                        | Åtgärd                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `reason=token_missing`                          | Ett browserförsök skickade ingen token.                                          | Klistra in aktuell gateway-token och anslut igen.                                                          |
| `phase=auth_validated` följt av 1008/pairing    | Tokenen accepterades; browsern väntar på device approval.                        | Följ [Dashboard-inloggning](#dashboard-inloggning).                                                        |
| `Proxy headers detected from untrusted address` | Render terminerar TLS framför containern, så anslutningen räknas inte som lokal. | Förväntad varning med token-auth; inte orsaken till pairing. Lägg inte till `0.0.0.0/0` som trusted proxy. |
| Origin-fel                                      | Browserns exakta origin saknas.                                                  | Rätta `SAJTAGENT_ALLOWED_ORIGINS`; entrypointen stoppar nu felaktigt formaterade origins.                  |

## Workspace-webhook (deploy-händelser, inte loggar)

Workspace-webhooken `openclaw-sajtagenten-events` finns i Render
(Integrations → Webhooks). Den skickar tunna händelser
(`deploy_started` / `deploy_ended`, build, server, disk) — inte
stdout från boot eller runtime.

- Destinationen är en **operator-lokal** inspektör, inte en Sajtmaskin-route
  och inte gatewayns `/hooks`. Appen har ingen `/api/webhooks/render`.
- Signing secret ligger bara lokalt (`.env.local`). Committa den inte, lägg
  den inte i Vercel, och lägg inte in den i `config/env-policy.json` förrän
  en riktig mottagare finns.
- Pro-planen har **en** destination. Byt URL i dashboarden; skapa inte en
  andra webhook för samma syfte.
- Själva loggarna: tjänstens **Logs**-flik (eller Log Streams). Webhooken
  ersätter inte dem.

Peka den inte mot `OPENCLAW_GATEWAY_URL` eller `/hooks/wake`: inbound hooks
är av i `generate-config.mjs`, och Renders payload matchar inte OpenClaws
`{text}`-kontrakt.

## Version och uppgradering

[`../../infra/openclaw/Dockerfile`](../../infra/openclaw/Dockerfile) pinnar den
OpenClaw-version som repot har verifierat. Ändra pinnen i en egen PR, kontrollera
release notes och kör minst det riktade entrypoint-testet samt checklistan ovan.
Använd inte `openclaw@latest` i produktion: en rebuild av oförändrad kod ska
inte kunna ändra auth- eller configsemantik.

## Secrets

- Lägg aldrig token i URL, logg, issue eller skärmbild.
- Om token har synts: generera en ny, sätt exakt samma värde i Render och
  Vercel, restarta/redeploya båda och klistra in den nya tokenen i dashboarden.
- Tokenen i incidentens skärmbild ska betraktas som exponerad. Rotation är en
  obligatorisk driftåtgärd efter merge, inte något PR:n kan utföra säkert.
- Stäng inte av device auth. Den gamla
  `OPENCLAW_CONTROLUI_DISABLE_DEVICE_AUTH`-flaggan är utfasad och ignoreras av
  entrypointen.
