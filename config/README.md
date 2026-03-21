# Config (policy + offline tooling)

This folder holds **machine-readable policy** and **offline helpers** — not Next.js runtime code.

| Path | Role |
|------|------|
| `env-policy.json` | Allowed / expected env keys for admin validation and drift checks. |
| `profiles/ai.defaults.ini` | Human-friendly defaults for AI models and token budgets (see comments inside). |
| `scripts/` | Offline helpers: docs embeddings, eval, audits. Run via `npm run …` from repo root. |

## Lighter-than-`.env` profiles

- Edit or copy `profiles/ai.defaults.ini`. For local overrides, use `profiles/ai.local.ini` (gitignored pattern — create it yourself).
- Print lines suitable for pasting into `.env.local`:

```bash
npm run config:env-print
python config/scripts/emit_env_from_ini.py --ini config/profiles/ai.defaults.ini
python config/scripts/emit_env_from_ini.py --ini config/profiles/ai.local.ini --export
```

Runtime code still reads **environment variables** (`src/lib/gen/defaults.ts`, `src/lib/env.ts`). The INI files are a **staging layer** so lanes (builder tiers vs prompt-assist routes) stay documented in one place.

## Where the rest lives

- **Dev / build entrypoints** (Next runner, DB init, Vercel gallery sync): `Scripts/` at repo root.
- **Template gallery (v0) embeddings**: `npm run templates:embeddings` (see `Scripts/README.md`).
