# Systemöversikt — egen motor och builder-entry

**Senast uppdaterad:** 2026-06-23. Modelltabell + scaffold-antal synkade mot `config/ai_models/manifest.json` och `src/lib/gen/scaffolds/`.

## Vad som är «Sajtmaskin» i det här dokumentet

- **Egen motor (own engine)** — standardväg för kodgenerering i buildern (`src/lib/gen/`, OpenAI).
- **v0** — fortfarande i API:t för mallar/registry/zip/deploy-hjälp; **inte** huvudstream för codegen (se [repository-and-platform.md](./repository-and-platform.md) § v0).
- **Preview** — tier-2 preview via `preview_host` / VM bakom `preview-session` / `preview-status` / `preview-heartbeat` / `preview-destroy` / `preview-hibernate`; tier-1 shim (`/api/preview-render`) är legacy/compat. Detaljer i [llm-pipeline.md](./llm-pipeline.md) § FAS 3.

## Pipeline (förenklad)

```
Användarprompt
  → Prompt assist (polish / deep brief, direkt mot OpenAI/Anthropic)
  → Orkestrering: scaffold, route-plan, kontrakt, systemprompt
  → Generering (build profile: fast / pro / max / codex m.fl.)
  → Post: URL-expansion, autofix, esbuild, filparsning, scaffold-merge
  → Version sparad i Postgres (`engine_versions.files_json`) → tier-2 preview (primärt `preview_host` / VM; shim endast legacy compat) → deploy (Vercel API)
```

Mer detaljerad runtime-flöde och modul-lista: [llm-pipeline.md](./llm-pipeline.md) § FAS 2.

## Own-engine preview vs «riktig» runtime

Standardpreview i buildern är nu **tier-2 preview** via `preview_host` / VM bakom `preview-*`-kontraktet. Tier-1 shim (`/api/preview-render`) kan finnas kvar för bakåtkompatibilitet eller diagnostik, men är **inte** standardvägen i produktflödet. För build-nära verifiering används preview-hosts separata verify-lane; för riktig deployment gäller deploy-spåret. Se [llm-pipeline.md](./llm-pipeline.md) § FAS 3.

## Modellmappning (kort)

| Build profile | Default-modell (manifest) | Roll |
|---------------|---------------------------|------|
| fast | `gpt-5.4-mini` | Snabba ändringar |
| pro | `gpt-5.3-codex` | Balanserad kod (**default**) |
| max | `gpt-5.5` | Tyngre reasoning |
| codex | `gpt-5.3-codex` | Kodprofil (högre reasoning-effort än `pro`; samma modell-id som Lagom) |
| anthropic | `claude-opus-4.8` | Anthropic-väg (Sonnet 4.6 pensionerad → aliasas till Opus) |

Canonical tabell och manifest: [`docs/schemas/model-build-profiles.md`](../schemas/model-build-profiles.md), `config/ai_models/manifest.json`.

## API-nycklar (kort)

| Område | Nyckel / flagga |
|--------|------------------|
| Kodgenerering | `OPENAI_API_KEY` |
| Prompt assist (direkt) | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| Audit / analys / vissa sido-routes | `OPENAI_API_KEY` (och ibland `ANTHROPIC_API_KEY` for fallbackkedjor) |

## Scaffold-system

**9 runtime scaffolds** under `src/lib/gen/scaffolds/` (landing-page, dashboard, base-nextjs, blog, app-shell, portfolio, saas-landing, ecommerce, auth-pages) — enda basen för promptstyrd generering. **v0-templates** (`src/lib/templates/`) är produktgalleri, inte samma register. Se [repository-and-platform.md](./repository-and-platform.md) § Terminologi.

## Builder-entry (`BuildMethod`)

Offentlig modell (detaljer): [`docs/schemas/builder-entry-contract.md`](../schemas/builder-entry-contract.md), [llm-pipeline.md](./llm-pipeline.md) § FAS 1.

| `BuildMethod` | Yta | Typiskt vid första render |
|---------------|-----|---------------------------|
| `freeform` | Fritext | `appProjectId`, ingen `chatId` än |
| `wizard` | Analyserad | samma |
| `audit` | Audit | samma |
| `category` | Mall / galleri | `templateId` eller `promptId` |
| `kostnadsfri` | Kostnadsfri funnel | `promptId` |

Tom `/builder` är **inte** en sjätte canonical metod — bootstrap. v0-template-init kan ligga under `category` med `templateId`.

## Planer och handoff

- **Samlad terminologi:** [`docs/architecture/glossary.md`](../architecture/glossary.md) — alla begrepp med livscykelstatus.
- **Index / buckets:** [`docs/plans/README.md`](../plans/README.md).
- **Läsrordning för ny agent:** `docs/README.md` → detta dokument → [llm-pipeline.md](./llm-pipeline.md) (FAS 1→2→3) → capstone ovan vid backlog-frågor.
- Handoffs sker i chatten; historik i git.
