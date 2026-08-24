# Fusklapp: verktyg (GitHub / Vercel / Fly / Supabase / Redis)

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
