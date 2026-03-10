# Miljövariabler

Översikt av env-variabler för lokal utveckling och Vercel-deploy. Fullständig validering finns i `src/lib/env.ts` och `src/app/api/admin/env/route.ts`.

## Kritiska (måste vara satta i produktion)

| Variabel | Lokalt | Vercel | Beskrivning |
|----------|--------|--------|-------------|
| `POSTGRES_URL` | .env.local | production, preview | Primär databas (Supabase) |
| `JWT_SECRET` | .env.local | production, preview | Auth-tokens |
| `OPENAI_API_KEY` | .env.local | production, preview | Own engine + prompt-assist (krävs när V0_FALLBACK_BUILDER inte är satt) |
| `V0_API_KEY` | .env.local | production, preview | v0 Platform API (krävs när V0_FALLBACK_BUILDER=y för fallback-läge) |
| `NEXT_PUBLIC_APP_URL` | .env.local | production, preview | Appens publika URL (t.ex. https://sajtmaskin.se) |

## E-post och korrespondens

| Variabel | Beskrivning |
|----------|-------------|
| `RESEND_API_KEY` | Resend — kontaktformulär (`/api/contact`), e-postverifiering vid registrering, återställ lösenord. Utan denna: formulär fungerar men mail skickas inte. |
| `EMAIL_FROM` | Avsändaradress (default: Sajtmaskin &lt;noreply@sajtmaskin.se&gt;) |

Utan `RESEND_API_KEY` fungerar appen, men användare får inga verifieringsmail och kontaktformuläret loggar bara meddelanden i stället för att skicka.

## Own engine (standardläge)

| Variabel | Default | Beskrivning |
|----------|---------|-------------|
| `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` | 32768 | Max output-tokens för sidgenerering |
| `SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS` | 12288 | Autofix-pipeline |
| `SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS` | 720000 (12 min) | Klient-timeout innan stream avbryts |
| `SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS` | 800 | Route maxDuration för build/refine |
| `SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS` | 600 | Route maxDuration för prompt-assist och brief |

## Vercel-deploy

**Måste jag upp med den här versionen på Vercel för att allt ska fungera?**  
Ja. Sajtmaskin-appen måste vara deployad på Vercel för att användare ska kunna skapa preview-URL:er, demo-URL:er och hemsidor. Lokal `npm run dev` räcker för utveckling; produktion kräver Vercel-deploy.

För att allt ska fungera på Vercel:

1. **Deploy** denna version (sajtmaskin-appen).
2. Sätt env-variablerna i Vercel för rätt miljöer (production, preview, development).
3. `manage_env.py` kan användas för att synka och jämföra lokala vs Vercel-env.

Användare som använder sajtmaskin.se behöver inga MCP-servrar. Preview-URL:er och demo-URL:er serveras av appen via `/api/preview-render` och eventuella v0 demoUrl när v0-fallback används.

## Lokal utveckling

1. Kopiera eller skapa `.env.local` med minst: `POSTGRES_URL`, `JWT_SECRET`, `OPENAI_API_KEY`.
2. För e-post: `RESEND_API_KEY` (valfritt i dev).
3. MCP-servrar i Cursor (`.cursor/mcp.json`): `sajtmaskin-engine` och `sajtmaskin-scaffolds` körs lokalt via `npx tsx` — behöver inte någon separat konfiguration utöver att repot är klonat och `npm install` är kört.
