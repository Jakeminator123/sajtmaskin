# Lokal generation (sällan `npm run dev`)

**Senast uppdaterad:** 2026-08-11  
**Syfte:** när du sällan kör Sajtmaskin lokalt — vad som faktiskt krävs för
användarsajt-generering, vad som ofta strejkar, och en kort checklista.

Kod är sanning. Den här runbooken speglar runtime + env-kontrakt; ändra ägare
först om beteendet ändras.

## Bekräftad diagnos (2026-08-11)

| Hypotes | Status |
|---|---|
| Lokal app pekar på **prod-Postgres** | **Avfärdad.** `.env.local` ska (och gjorde i granskningen) peka på Supabase **DEV** (`yubbckduwblyrbnlglwf`, `eu-north-1`). Guard: `npm run db:check-target -- --expect=dev`. |
| Lokal generation “funkar inte som prod” | **Oftast preview/verify**, inte codegen/DB. Lokal Next skriver till DEV-DB och anropar LLM; live iframe + F2 quality gate går via **preview-host**. |
| Huvudrisk vid nuvarande laptop-setup | **Hybrid:** lokal app → **delad Fly**-host (`SAJTMASKIN_PREVIEW_HOST_BASE_URL`, typ `vm-fly-jakem.fly.dev`) som också används från Vercel production. |

```text
laptop (npm run dev)  →  Supabase DEV
                      →  OpenAI / Anthropic
                      →  Fly preview-host (delad med prod)
```

DEV≈PROD i **schema** är rätt mål (migration-paritet). Peka **inte** lokal
`POSTGRES_URL` på prod för att “likna prod” — det blandar data och är farligare.
Se [`docs/ENV.md`](../ENV.md) → Databas: dev/prod-identitet och
[`config/db-targets.json`](../../config/db-targets.json).

## Vad som ska funka / vad som flakar

| Steg | Med typisk hybrid-env |
|---|---|
| Landing → projekt → builder | Ja (DEV-DB) |
| Own-engine stream / filgenerering | Ja (LLM-nycklar) |
| Persistens chat/version | Ja (DEV) |
| Live iframe + F2 quality gate | Beroende av Fly-hostens hälsa/last |
| Full isolering utan Fly | Nej — kräver lokal `preview-host/` |

Utan `SAJTMASKIN_PREVIEW_HOST_BASE_URL` startar ingen tier-2-preview
(`isTier2PreviewConfigured` i `src/lib/gen/preview/tier2-config.ts`). Då kan
codegen lyckas medan previewytan ser död/vit ut — se
[`preview-white-screen.md`](preview-white-screen.md).

## Rankade fallgropar

1. **Delad Fly preview-host** — lokal och prod delar boot/disk/sessioner.
   Symptom: timeout, vit iframe, `preview_failed`, version_mismatch, hängande
   “Startar live-preview”.
2. **`SAJTMASKIN_PREVIEW_PREWARM=true` mot samma host** — prewarm från laptop
   ökar lease-/boot-konflikt mot prod. Rekommendation vid sällan-körning:
   sätt `SAJTMASKIN_PREVIEW_PREWARM=false` (eller unset) i `.env.local`.
3. **Kall lokal stack** — saknad embeddings-diskcache / warm-cache, Turbopack
   cold 404 på första stream-anropet efter restart, `SKIP_PREDEV` som hoppar
   över `db:init`.
4. **Olika defaults local vs prod** — t.ex. auto-repair vid build-error är
   default **på** i `NODE_ENV=development`, **av** i production
   (`src/lib/gen/verify/server-verify/build-error-trigger.ts`).
5. **Delad Upstash/Redis** — samma REST-host i `.env.local` som Vercel ⇒
   rate-limit/cache kan krocka. Inte den vanligaste gen-killern; isolera bara
   om du ser “ibland”-blockeringar. Dev kan falla tillbaka på minne utan
   Upstash; prod fail-closed utan REST (se `docs/ENV.md`).
6. **Sidospår** — OpenClaw/webhooks/OAuth mot localhost. Stoppar sällan
   own-engine-codegen. `OPENCLAW_GATEWAY_URL` får **inte** vara appens egen
   `localhost:3000`.

## Checklista (när du väl kör lokalt)

PowerShell från repo-roten:

1. Verifiera DB-mål:
   ```powershell
   npm run db:check-target -- --expect=dev
   ```
2. Starta med full `predev` första gången efter lång paus (synkar DEV-schema):
   ```powershell
   npm run dev
   ```
   Undvik `SKIP_PREDEV=1` / enbart `node scripts/dev/next-runner.mjs dev` tills
   schemat är aktuellt. Om varning om saknade migrationer: `npm run db:ensure`.
3. Bekräfta preview-host innan generate — öppna hostens `/health` (Fly-bas-URL
   eller lokal `:8080`).
4. Logga in med en adress i `ADMIN_EMAILS` så guest-gratisgenereringen inte
   stoppar dig.
5. Generera en gång. Om stream svarar 404 direkt efter restart: vänta några
   sekunder och försök igen (Turbopack cold compile).
6. Preview strejkar? Felsök Fly/session först (`preview_session_disabled`, vit
   iframe, timeout) — inte Postgres. Se [`preview-white-screen.md`](preview-white-screen.md).
7. Valfritt — mjukare lokal körning mot delad Fly:
   - `SAJTMASKIN_PREVIEW_PREWARM=false` i `.env.local`
   - behåll `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=fly.dev` när
     preview-URL:er är `*.fly.dev`

## Isolerad lokal preview (valfritt, mer setup)

När du behöver deterministisk preview utan att röra prod-Fly:

1. I `preview-host/`: installera deps en gång (`npm ci --prefix preview-host`).
2. Starta host:
   ```powershell
   # från preview-host/
   $env:HOST = "127.0.0.1"
   $env:PREVIEW_BASE_URL = "http://localhost:8080"
   npm start
   ```
   `HOST=127.0.0.1` gör miljön “lokal” så `PREVIEW_HOST_API_KEY` inte krävs.
   Default `HOST=0.0.0.0` kräver nyckel.
3. I appens `.env.local`:
   - `SAJTMASKIN_PREVIEW_HOST_BASE_URL=http://localhost:8080`
   - `NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES=localhost,fly.dev`  
     (env **ersätter** defaultlistan — ta med `fly.dev` om du fortfarande vill
     känna igen Fly-URL:er)
4. Starta om Next så `NEXT_PUBLIC_*` plockas upp.

Detaljerat Cloud-pod-recept (samma preview-mekanik):  
[`cursor-cloud-agent.md`](cursor-cloud-agent.md) § lokal preview-host.

## Embeddings och warm-cache (soft-fail)

| Saknas lokalt | Effekt | Åtgärd |
|---|---|---|
| Embeddings på disk (`STORAGE_BACKEND=fs`) | Sämre/baseline scaffold-val (`missing_embeddings`), sällan hård crash | `npm run embeddings:ensure` eller `npm run embeddings:sync` |
| Warm-cache | Pre-VM typecheck skippar fail-open om flagga på men cache kall | [`warm-cache-setup.md`](warm-cache-setup.md) → `npm run provision:warm-cache` |

## Behåll DEV ≈ PROD (schema)

- Lokal + Vercel **Development** → DEV-ref.
- Vercel **Production** → PROD-ref.
- Synka med `npm run db:migrate` / `db:migrate:prod` och
  `npm run db:schema-parity` — se [`db-migrations.md`](db-migrations.md).
- Dela gärna LLM-nycklar mellan miljöer.
- Var mer försiktig med **delad preview-host** och **delad Redis** om lokal
  felsökning ska vara deterministisk.

## Relaterat

| Ämne | Doc |
|---|---|
| Env-nycklar / DB-identitet | [`docs/ENV.md`](../ENV.md) |
| Vit preview / shim vs host | [`preview-white-screen.md`](preview-white-screen.md) |
| Cloud Agent-gotchas (överlappar lokalt) | [`cursor-cloud-agent.md`](cursor-cloud-agent.md) |
| Warm-cache | [`warm-cache-setup.md`](warm-cache-setup.md) |
| Migrationer / paritet | [`db-migrations.md`](db-migrations.md) |
