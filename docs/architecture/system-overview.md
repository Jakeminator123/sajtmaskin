# Systemöversikt — egen motor och builder-entry

**Senast uppdaterad:** 2026-03-31

## Vad som är «Sajtmaskin» i det här dokumentet

- **Egen motor (own engine)** — standardväg för kodgenerering i buildern (`src/lib/gen/`, OpenAI).
- **v0** — fortfarande i API:t för mallar/registry/zip/deploy-hjälp; **inte** huvudstream för codegen (se [repository-and-platform.md](./repository-and-platform.md) § v0).
- **Preview** — tier-2 preview via `preview_host` / VM bakom `preview-session` / `preview-status` / `preview-heartbeat` / `preview-destroy` / `preview-hibernate`; tier-1 shim (`/api/preview-render`) är legacy/compat. Detaljer i [preview-deploy.md](./preview-deploy.md).

## Pipeline (förenklad)

```
Användarprompt
  → Prompt assist (polish / deep brief, direkt mot OpenAI/Anthropic)
  → Orkestrering: scaffold, route-plan, kontrakt, systemprompt
  → Generering (build profile: fast / pro / max / codex m.fl.)
  → Post: autofix, esbuild, URL/expansion, filparsning, scaffold-merge
  → Version sparad i Postgres (`engine_versions.files_json`) → tier-2 preview (primärt `preview_host` / VM; shim endast legacy compat) → deploy (Vercel API)
```

Mer detaljerad runtime-mermaid och modul-lista: [builder-generation.md](./builder-generation.md).

## Own-engine preview vs «riktig» runtime

Standardpreview i buildern är nu **tier-2 preview** via `preview_host` / VM bakom `preview-*`-kontraktet. Tier-1 shim (`/api/preview-render`) kan finnas kvar för bakåtkompatibilitet eller diagnostik, men är **inte** standardvägen i produktflödet. För build-nära verifiering används preview-hosts separata verify-lane; för riktig deployment gäller deploy-spåret. Se [preview-deploy.md](./preview-deploy.md).

## Modellmappning (kort)

| Build profile | Typisk OpenAI-modell | Roll |
|---------------|----------------------|------|
| fast | `gpt-4.1` | Snabba ändringar |
| pro | `gpt-5.3-codex` | Balanserad kod |
| max | `gpt-5.4` | Tyngre reasoning |
| codex | `gpt-5.3-codex-max` | Kod med xhigh reasoning |

Canonical tabell och manifest: [`docs/schemas/model-build-profiles.md`](../schemas/model-build-profiles.md), `config/ai_models/manifest.json`.

## API-nycklar (kort)

| Område | Nyckel / flagga |
|--------|------------------|
| Kodgenerering | `OPENAI_API_KEY` |
| Prompt assist (direkt) | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| Audit / analys / vissa sido-routes | `OPENAI_API_KEY` (och ibland `ANTHROPIC_API_KEY` for fallbackkedjor) |

## Scaffold-system

~10 **runtime scaffolds** under `src/lib/gen/scaffolds/` — enda basen för promptstyrd generering. **v0-templates** (`src/lib/templates/`) är produktgalleri, inte samma register. Se [repository-and-platform.md](./repository-and-platform.md) § Terminologi.

## Builder-entry (`BuildMethod`)

Offentlig modell (detaljer): [`docs/schemas/builder-entry-contract.md`](../schemas/builder-entry-contract.md), [builder-generation.md](./builder-generation.md).

| `BuildMethod` | Yta | Typiskt vid första render |
|---------------|-----|---------------------------|
| `freeform` | Fritext | `appProjectId`, ingen `chatId` än |
| `wizard` | Analyserad | samma |
| `audit` | Audit | samma |
| `category` | Mall / galleri | `templateId` eller `promptId` |
| `kostnadsfri` | Kostnadsfri funnel | `promptId` |

Tom `/builder` är **inte** en sjätte canonical metod — bootstrap. v0-template-init kan ligga under `category` med `templateId`.

## Planer och handoff

- **Samlad slutstatus för avslutat 5-stegsspår:** [`../../5-steg.txt`](../../5-steg.txt) — sammanfattning, kvarvarande problemområden och nästa naturliga pass.
- **Index / buckets:** [`docs/plans/README.md`](../plans/README.md).
- **Läsrordning för ny agent:** `docs/README.md` → detta dokument → [builder-generation.md](./builder-generation.md) → [preview-deploy.md](./preview-deploy.md) → capstone ovan vid backlog-frågor.
- Tidigare `docs/handoffs/*.md` är **borttagna**; fulltext i **git-historik**. Pekare: [`docs/handoffs/README.md`](../handoffs/README.md).
