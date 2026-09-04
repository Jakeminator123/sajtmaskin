# Fusklapp: verktyg och miljöer (GitHub / Vercel / Fly / Render / Supabase / Redis)

> Kort lokal setup för den här maskinen + hur man vet att databaserna är rätt.
> Secrets hör **aldrig** i git. Runtime-sanning: `docs/ENV.md`, `config/db-targets.json`.

## Global vs lokalt

| Sak | Var | Kommentar |
|---|---|---|
| `gh` / SSH-nycklar | **Globalt** | Ett GitHub-konto |
| `vercel login` / `fly` CLI | **Globalt** | Ett konto; välj app per mapp |
| Volta + Node | **Globalt** (pin i `package.json`) | Node `22.23.1` |
| `.vercel/` + `.env.local` | **Lokalt i repo** | Rätt projekt + secrets |
| `.cursor/mcp.json` | **Lokalt** (+ global fallback) | Rätt Supabase/Vercel-mål |

## GitHub + SSH

```powershell
# Status
gh auth status
ssh -T git@github.com   # ska säga: Hi <user>! ...

# Nyckel (om saknas)
ssh-keygen -t ed25519 -C "din@email" -f $HOME\.ssh\id_ed25519
gh ssh-key add $HOME\.ssh\id_ed25519.pub --title "denna-pc"

# Klon
git clone git@github.com:Jakeminator123/sajtmaskin.git
```

SSH-config (`~/.ssh/config`):

```text
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

## Vercel (huvudappen)

```powershell
vercel login
vercel link --yes --project sajtmaskin --scope jakeminator123s-projects
vercel env pull .env.local --environment development --yes
vercel whoami
```

- Produktion: `https://sajtmaskin.se` / Vercel-projektet **sajtmaskin**
- `.vercel/` och `.env.local` är gitignorerade

## Miljöer och URL:er

Vercel-projektet **sajtmaskin** har en production-branch (`master`) och en
preview-branch (`preview`). `vercel.json` (`git.deploymentEnabled`) är en
allowlist: bara branchar som står där deployar överhuvudtaget.

| URL | Branch | Vercel-env | Åtkomst |
|---|---|---|---|
| `https://sajtmaskin.se` | `master` | production | öppen |
| `https://sajtmaskin.com` | `master` | production | öppen |
| `https://www.sajtmaskin.se` / `.com` | — | — | 308 → apex |
| `https://sajtmaskin.vercel.app` | `master` | production | öppen |
| `https://preview.sajtmaskin.se` | `preview` | preview | Vercel-inloggning |
| `sajtmaskin-git-preview-jakeminator123s-projects.vercel.app` | `preview` | preview | Vercel-inloggning |
| `https://vm-fly-jakem.fly.dev` | — | — | delas av alla miljöer |
| `https://openclaw-sajtagenten.onrender.com` | — | — | token + device pairing |

De fem första production-raderna är **samma** deploy — flera dörrar, ett rum.
Preview delar databas och env-värden med production; det är avsiktligt, men
generering från preview skriver alltså i prod-data.

`ssoProtection` är `all_except_custom_domains`. Undantaget gäller bara
**production**-domäner: `sajtmaskin.se` och `.com` svarar 200, medan varje
preview-adress kräver Vercel-inloggning — även en egen domän som
`preview.sajtmaskin.se`. Inloggad browser släpps in direkt. För anrop utan
session finns ett bypass-secret på projektet (`scope=automation-bypass`) som
skickas som headern `x-vercel-protection-bypass`.

`preview.sajtmaskin.se` finns alltså för att vara kort och stabil, inte för att
vara öppen. Den pekar alltid på senaste preview-deploy.

### DNS

`sajtmaskin.se` och `sajtmaskin.com` har nameservers hos **one.com**, inte
Vercel. Vercels egen DNS-zon för domänerna är inte auktoritativ, så en post
där får ingen effekt. Nya subdomäner läggs som CNAME hos one.com mot värdet i
`vercel api /v6/domains/<domän>/config` (`recommendedCNAME`, rank 1).

### Externa allowlists som måste följa med en ny URL

Ingen av dessa läses från Vercel-env. De bor i respektive tjänst.

| Tjänst | Nyckel / plats | Semantik |
|---|---|---|
| Preview-host (Fly) | `SAJTMASKIN_APP_ORIGINS` i `preview-host/fly.toml` | Exakta origins, aldrig wildcard. Fail-closed. Kräver `fly deploy`. Låst av kontraktstest i `preview-host/scripts/test-preview-proxy-contract.mjs` — ändra båda i samma diff |
| OpenClaw-gateway (Render) | `SAJTAGENT_ALLOWED_ORIGINS` + `SAJTAGENT_TARGET_SITE_URL` | Gäller gatewayns **controlUi** (adminytan), inte appens widget — den går server-till-server med Bearer-token. `http://localhost:3000` läggs på automatiskt. Malformerad post kraschar boot |
| D-ID avatar | D-ID Studio, manuellt | Browser-origins för embed-scriptet. Speglas i listan i `src/app/avatar/page.tsx` |
| OpenAI-webhooks | OpenAI-dashboarden | Pekar på `sajtmaskin.vercel.app/api/webhooks/openai` — låt den peka på production |
| Vercel Log Drain | Vercels drain-dialog | Pekar på `sajtmaskin.vercel.app/api/drains/vercel` — låt den peka på production |

Checklista när en ny miljö-URL tillkommer: bind domänen i Vercel med rätt
`gitBranch` → CNAME hos one.com → origin i `fly.toml` + kontraktstestet →
`fly deploy` → sätt miljöns egen `NEXT_PUBLIC_APP_URL` i Vercel och redeploya
den miljön (`NEXT_PUBLIC_*` bakas in vid build).

## Fly (preview-host)

App: **`vm-fly-jakem`** (`preview-host/fly.toml`). Det är VM-preview, inte Next-appen.

```powershell
# Alternativ A — interaktiv (riktig terminal / egen pwsh)
fly auth login
fly auth whoami

# Alternativ B — token (CI / Cursor utan TTY)
# FLY_DEPLOY_TOKEN finns i Vercel development-env → .env.local
$env:FLY_API_TOKEN = "<värde från FLY_DEPLOY_TOKEN>"
fly auth whoami
fly status -a vm-fly-jakem
fly logs -a vm-fly-jakem
```

Deploy (från `preview-host/`, efter verifiering):

```powershell
cd preview-host
npm run check
npm run test:guards
# sedan: fly deploy -a vm-fly-jakem
```

Ordning: host först → health OK → huvudappen. Se `preview-host/README.md`.

## MCP (Cursor)

```powershell
# Synka ignorerad lokal fil från mallen
powershell -File scripts/cursor/sync-mcp-json.ps1
```

| Server | Betydelse |
|---|---|
| `vercel` | Projekt-scopad sajtmaskin |
| `user-vercel` | Fallback / andra projekt |
| `supabase` | **DEV** (`yubbckduwblyrbnlglwf`, eu-north-1) read-only |
| `supabase-prod` | **PROD** (`egcitvwgettkftkyzbvn`, us-east-1) read-only |

Efter ändring: Cursor → Tools & MCP → grön status / reload.
**Ingen destruktiv SQL** via MCP. Svara aldrig om prod utifrån `supabase` (dev).

Redis har **ingen** MCP här — använd env (`REDIS_URL` / Upstash) + `npm run redis:health`.

## Dev vs prod (Supabase) — inte samma databas

Två **olika** Postgres-projekt (olika `project_ref` + region). Identitet: `config/db-targets.json`.

| | DEV | PROD |
|---|---|---|
| Ref | `yubbckduwblyrbnlglwf` | `egcitvwgettkftkyzbvn` |
| Region | eu-north-1 | us-east-1 |
| Används av | Lokal `.env.local`, Vercel Development, CI `POSTGRES_URL_DEV` | Vercel Production, CI `POSTGRES_URL_PROD` |

**Varför två?** Så lokal utveckling och PR-experiment inte kan förstöra riktiga användardata. Migrationer provas på dev; prod uppdateras kontrollerat vid merge till `master`.

## Är databaserna “i synk”? Vad CI kollar

| Gate | När | Vad den egentligen jämför |
|---|---|---|
| **`schema-drift`** | **PR + push** (hård gate) | Kod ↔ kod: `schema.ts` vs init/index-skript. **Ingen** live-DB, **ingen** secret |
| **`prod-migrations-apply`** | Push till **master** (inte PR) | Applicerar migrationer mot **prod** |
| **`prod-migrations-applied`** | Efter apply | Prod-ledger täcker alla filer |
| **`db-schema-parity`** | Efter apply + **daglig cron** | Live **dev ↔ prod** objekt för objekt |

**På PR:** du får alltså **inte** automatisk live-jämförelse av Supabase-instanserna (prod-secrets injiceras inte på `pull_request`). Du får däremot `schema-drift` så att *repots* schema-sanning inte divergerar.

Lokalt / efter secrets:

```powershell
npm run db:schema-drift          # snabb, nyckelfri
npm run db:schema-parity         # kräver DEV+PROD URL:er
npm run db:migrate:check         # ligger lokal/dev efter?
npm run redis:health
```

Regeln för agenter: `.cursor/rules/db-env-parity.mdc` + runbook `docs/runbooks/db-migrations.md`.

## Snabb hälsokoll efter ny maskin

1. `gh auth status` + `ssh -T git@github.com`
2. `node -v` → `v22.23.1` (Volta)
3. `vercel whoami` + `Test-Path .env.local`
4. `fly auth whoami` (eller `FLY_API_TOKEN`) + `fly status -a vm-fly-jakem`
5. Cursor MCP: `supabase` / `supabase-prod` / `vercel` gröna
6. `npm run db:schema-drift` (och parity när båda URL:erna finns)
