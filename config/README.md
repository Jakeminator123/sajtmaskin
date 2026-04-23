# config/

Kanoniska **JSON/MD/txt** som Sajtmaskin-appen, bygget och skript **läser** vid runtime eller generation. **Undantag:** `dashboard/` — valfri Streamlit-app (`app.py`), importeras **inte** av Next.js.

| Del | Roll |
|-----|------|
| `codegen-core-manifest.json` + `prompt-core/` | Statisk own-engine-systemprompt — fragmentordning i JSON, texter som `.md`. (Tidigare kända som `codegen-static-prompt.json` + `prompt-static/` i äldre docs — namnbyte genomfört; referenser synkade 2026-04-23.) |
| `ai_models/` | `manifest.json` + mänskliga noter; modellval, prompt/brief-ingress, tokenbudgetar, route-timeouts, phase-routing för planner/fixer/verifier, post-generation verifier-budgetar, repair-passgränser, prompt-orchestration-gränser, pre-generation contract/provider-regler, workload-katalog, `qualityGateTiers` (`designPreview` / `integrationsBuild`) samt två placeholder-fragment (`40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`) som mergas till tier-2-previewens `.env.local` av `src/lib/gen/preview/env-local.ts`. |
| `env-policy.json` | Policy för env-nycklar (par med `src/lib/env.ts`, `docs/ENV.md`). |
| `shadcn-mirror-audit-policy.json` | Audit-policy för `npm run mirror:audit` mot externa mall-repon. Research-/audit-only, inte runtime eller own-engine-generering. |
| `user_degraded_env.txt` | Policytext för degraded/placeholder i användarprojekt. |
| `dashboard/` | Stöddata för den konsoliderade backoffice-appen — [`domain-map.json`](dashboard/domain-map.json), kör [`dashboard/run.ps1`](dashboard/run.ps1). Den kanoniska Streamlit-ytan ligger i repo-roten (`sajtmaskin_backoffice.py`) med kod under `backoffice/`. `config/dashboard/app.py` och `dashboard/shared_overhead.py` finns kvar som bakåtkompatibla wrappers/re-exports. Delad logik ligger i `backoffice/shared.py`. |

**Ingångar:** [`prompt-core/_READ_ME_FIRST.md`](prompt-core/_READ_ME_FIRST.md) · [`ai_models/_READ_ME_FIRST.md`](ai_models/_READ_ME_FIRST.md) · [`docs/architecture/repo-tree.md`](../docs/architecture/repo-tree.md).
