# config/

Kanoniska **JSON/MD/txt** som Sajtmaskin-appen, bygget och skript **läser** vid runtime eller generation. **Undantag:** `dashboard/` — valfri Streamlit-app (`app.py`), importeras **inte** av Next.js.

| Del | Roll |
|-----|------|
| `codegen-static-prompt.json` + `prompt-static/` | Statisk own-engine-systemprompt — fragmentordning i JSON, texter som `.md`. |
| `ai_models/` | `manifest.json` + mänskliga noter; modellval, prompt/brief-ingress, tokenbudgetar, route-timeouts, phase-routing för planner/fixer/verifier, post-generation verifier-budgetar, repair-passgränser, prompt-orchestration-gränser, pre-generation contract/provider-regler, workload-katalog samt `40-generated-site-integration-placeholders.env.txt` som mergas till tier-2-previewens `.env.local` när `startPreviewSession` körs, se `src/lib/gen/preview/env-local.ts`. |
| `env-policy.json` | Policy för env-nycklar (par med `src/lib/env.ts`, `docs/ENV.md`). |
| `shadcn-mirror-audit-policy.json` | Audit mot externa mall-repon. |
| `user_degraded_env.txt` | Policytext för degraded/placeholder i användarprojekt. |
| `dashboard/` | GUI för redigering/översikt — [`domain-map.json`](dashboard/domain-map.json), kör [`dashboard/run.ps1`](dashboard/run.ps1). Detta är **konfigurationspanelen** för `config/*` och vissa docs/rules-y tor. Den kompletterar `scripts/scripts_dashboard.py`, som i stället är **pipeline-/artifactpanelen** för rebuild, embeddings, scaffolds och externa referenser. `config/dashboard/` är inte en egen runtime-källa. |

**Ingångar:** [`prompt-static/_READ_ME_FIRST.md`](prompt-static/_READ_ME_FIRST.md) · [`ai_models/_READ_ME_FIRST.md`](ai_models/_READ_ME_FIRST.md) · [`docs/architecture/repo-tree.md`](../docs/architecture/repo-tree.md).
