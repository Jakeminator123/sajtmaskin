# Systemöversikt — egen motor och builder-entry

**Senast uppdaterad:** 2026-03-27

## Vad som är «Sajtmaskin» i det här dokumentet

- **Egen motor (own engine)** — standardväg för kodgenerering i buildern (`src/lib/gen/`, OpenAI).
- **v0** — fortfarande i API:t för mallar/registry/zip/deploy-hjälp; **inte** huvudstream för codegen (se [repository-and-platform.md](./repository-and-platform.md) § v0).
- **Preview** — snabb shim (`/api/preview-render`) och/eller sandbox — detaljer i [preview-deploy.md](./preview-deploy.md).

## Pipeline (förenklad)

```
Användarprompt
  → Prompt assist (polish / deep brief, valfritt via AI Gateway)
  → Orkestrering: scaffold, route-plan, kontrakt, systemprompt
  → Generering (build profile: fast / pro / max / codex m.fl.)
  → Post: autofix, esbuild, URL/expansion, filparsning, scaffold-merge
  → Version sparad → preview (shim) → valfritt sandbox → deploy (Vercel API)
```

Mer detaljerad runtime-mermaid och modul-lista finns i arkivet: `archive/pre-2026-03-consolidation/engine-status.md`.

## Own-engine preview vs «riktig» runtime

Standardpreview är **inte** full `next build` i iframen — den bygger en **snabb HTML-shim** från sparade filer. För närmare riktig Next-runtime: **sandbox** eller **deploy**. Se [preview-deploy.md](./preview-deploy.md).

## Modellmappning (kort)

| Build profile | Typisk OpenAI-modell | Roll |
|---------------|----------------------|------|
| fast | `gpt-4.1` | Snabba ändringar |
| pro | `gpt-5.3-codex` | Balanserad kod |
| max | `gpt-5.4` | Tyngre reasoning |
| codex | `gpt-5.1-codex-max` | Kod med xhigh reasoning |

Canonical tabell och manifest: [`docs/schemas/model-build-profiles.md`](../schemas/model-build-profiles.md), `config/ai_models/manifest.json`.

## API-nycklar (kort)

| Område | Nyckel / flagga |
|--------|------------------|
| Kodgenerering | `OPENAI_API_KEY` |
| Prompt assist / gateway | `AI_GATEWAY_API_KEY` |
| v0 SDK (mallar m.m.) | `V0_API_KEY` |
| Preview-preferens v0-host | `V0_FALLBACK_BUILDER` (affirmative → föredra v0 `demoUrl` i UI när både sandbox och v0 finns) |

## Scaffold-system

~10 **runtime scaffolds** under `src/lib/gen/scaffolds/` — enda basen för promptstyrd generering. **v0-templates** (`src/lib/templates/`) är produktgalleri, inte samma register. Se [repository-and-platform.md](./repository-and-platform.md) § Terminologi.

## Builder-entry (`BuildMethod`)

Offentlig modell (detaljer + mermaid): arkiv `builder-entry-flow.md`.

| `BuildMethod` | Yta | Typiskt vid första render |
|---------------|-----|---------------------------|
| `freeform` | Fritext | `appProjectId`, ingen `chatId` än |
| `wizard` | Analyserad | samma |
| `audit` | Audit | samma |
| `category` | Mall / galleri | `templateId` eller `promptId` |
| `kostnadsfri` | Kostnadsfri funnel | `promptId` |

Tom `/builder` är **inte** en sjätte canonical metod — bootstrap. v0-template-init kan ligga under `category` med `templateId`.

## Planer och handoff

- **Operativ backlog (kanonisk):** [`docs/plans/active/PROJECT-STATE-AND-DIRECTION.md`](../plans/active/PROJECT-STATE-AND-DIRECTION.md) — K-rader, Plan 17, beslut.
- **Index / buckets:** [`docs/plans/README.md`](../plans/README.md), övrigt under [`docs/plans/active/`](../plans/active/) (korta README:er; ingen separat MASTER/execution längre).
- **Läsrordning för ny agent:** `docs/README.md` → detta dokument → [builder-generation.md](./builder-generation.md) → [preview-deploy.md](./preview-deploy.md) → capstone ovan vid backlog-frågor.
- Utförlig historisk handoff-tabell: arkiv [`archive/pre-2026-03-consolidation/agent-roadmap-and-handoff.md`](./archive/pre-2026-03-consolidation/agent-roadmap-and-handoff.md) (narrativ; **inte** fil-lista som sanning).
