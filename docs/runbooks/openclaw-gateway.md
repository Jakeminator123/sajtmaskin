# OpenClaw-gateway på Render

Den här runbooken är snabbvägen för Sajtagentens separata OpenClaw-gateway.
Detaljerad konfiguration och felkatalog finns i
[`../../infra/openclaw/DEPLOY_INFO.txt`](../../infra/openclaw/DEPLOY_INFO.txt).

## Första kontrollen

1. `GET https://<gateway>.onrender.com/health` ska ge HTTP 200.
2. Bootloggen ska visa `Config written`, den pinnade OpenClaw-versionen och
   rätt `controlUi.allowedOrigins`.
3. Vercel ska ha `OPENCLAW_GATEWAY_URL=https://<gateway>.onrender.com`, samma
   `OPENCLAW_GATEWAY_TOKEN` som Render och `IMPLEMENT_UNDERSCORE_CLAW=true`.
4. `GET https://<appen>/api/openclaw/health` ska visa `readiness: "ready"`.
   Den kontrollen anropar autentiserat `/v1/models` och fångar både fel token
   och saknade agentmål; Renders `/health` är bara process-liveness.

`OPENCLAW_GATEWAY_URL` använder `https://` i Vercel. Dashboardens WebSocket-fält
använder `wss://`.

## Modellrouting och säker utrullning

Sajtagenten är en publik yta men gatewayn har tre interna agentmål:

| Spår | Agent-id | Render-modell | Thinking | Användning |
| --- | --- | --- | --- | --- |
| Snabb | `sajtagenten-fast` | `openai/gpt-5.6-luna` | `low` | Tips och enkla frågor |
| Normal | `sajtagenten-balanced` | `openai/gpt-5.6-terra` | `medium` | Begränsad kod-/filkontext |
| Stark | `sajtagenten` | `openai/gpt-5.6-sol` | `high` | Review, debug, full kontext och aktiva befogenheter |

Appen väljer bara agent-id. Provider/modell, fallbackkedjor och thinking ägs av
Render-konfigurationen. Om ett gammalt gatewaybygge saknar snabb-/normalagenten
gör appen en enda kompatibilitetsretry mot `sajtagenten`; 401, 429 och generella
fel retryas inte.

Utrullningsordning:

1. Deploya Render med de sex `OPENCLAW_MODEL_*`-värdena från `render.yaml`.
2. Kontrollera bootlogg och autentiserat `GET /v1/models`; där ska
   `openclaw/sajtagenten`, `openclaw/sajtagenten-balanced` och
   `openclaw/sajtagenten-fast` finnas.
3. Deploya appen med `OPENCLAW_MODEL_ROUTING_ENABLED` osatt/`false`. Health ska
   fortfarande vara `ready` på det bakåtkompatibla starka agentmålet.
4. Sätt `OPENCLAW_MODEL_ROUTING_ENABLED=true` på Vercel för development,
   preview och production och redeploya. Health ska åter vara `ready`, nu med
   alla tre agent-id:n i `requiredAgentIds`.

`OPENCLAW_REVIEW_REASONING_EFFORT` är borttagen. OpenClaw `2026.7.1-2`
vidarebefordrar inte det fältet från Chat Completions-routen; per-agent
`thinkingDefault` ovan är den fungerande signalägaren.

## Ny browser: engångsgodkänn enheten

Device pairing är ett andra skydd för den publikt nåbara adminytan. Den är
separat från appens server-till-server-chat, som använder Bearer-token.

1. Öppna dashboarden, klistra in gateway-tokenen och tryck **Connect**.
2. Med den röda pairing-rutan fortfarande öppen, kör i Render Shell:

   ```sh
   openclaw devices list --json
   ```

3. Kontrollera att posten gäller `openclaw-control-ui`, rätt browser/plattform
   och förväntade operator-scopes. Godkänn exakt det aktuella id:t:

   ```sh
   openclaw devices approve <requestId>
   ```

4. Tryck **Connect** igen. Samma browserprofil ska därefter ligga under
   `paired` på den persistenta disken.

Pending request-id:n löper ut och kan ersättas när browsern försöker igen. Om
`devices list` är tom eller approval säger `No pending device request matches`:
tryck **Connect** en gång till och lista omedelbart igen. Återanvänd inte id:t
från en gammal skärmbild eller loggrad.

## Så läses de vanliga WebSocket-loggarna

| Logg                                            | Betydelse                                                                        | Åtgärd                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `reason=token_missing`                          | Ett browserförsök skickade ingen token.                                          | Klistra in aktuell gateway-token och anslut igen.                                                          |
| `phase=auth_validated` följt av 1008/pairing    | Tokenen accepterades; browsern väntar på device approval.                        | Följ pairing-flödet ovan.                                                                                  |
| `Proxy headers detected from untrusted address` | Render terminerar TLS framför containern, så anslutningen räknas inte som lokal. | Förväntad varning med token-auth; inte orsaken till pairing. Lägg inte till `0.0.0.0/0` som trusted proxy. |
| Origin-fel                                      | Browserns exakta origin saknas.                                                  | Rätta `SAJTAGENT_ALLOWED_ORIGINS`; entrypointen stoppar nu felaktigt formaterade origins.                  |

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
