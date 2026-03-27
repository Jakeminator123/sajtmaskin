# config/

Kanoniska **JSON/MD/txt** som Sajtmaskin-appen, bygget och skript **läser** vid runtime eller generation. **Undantag:** `dashboard/` — valfri Streamlit-app (`app.py`), importeras **inte** av Next.js.

| Del | Roll |
|-----|------|
| `codegen-static-prompt.json` + `prompt-static/` | Statisk own-engine-systemprompt — fragmentordning i JSON, texter som `.md`. |
| `ai_models/` | `manifest.json` + mänskliga noter; modellval, budgetar, workloads. |
| `env-policy.json` | Policy för env-nycklar (par med `src/lib/env.ts`, `docs/ENV.md`). |
| `shadcn-mirror-audit-policy.json` | Audit mot externa mall-repon. |
| `user_degraded_env.txt` | Policytext för degraded/placeholder i användarprojekt. |
| `dashboard/` | GUI för redigering/översikt — [`domain-map.json`](dashboard/domain-map.json), kör [`dashboard/run.ps1`](dashboard/run.ps1). |

**Ingångar:** [`prompt-static/_READ_ME_FIRST.md`](prompt-static/_READ_ME_FIRST.md) · [`ai_models/_READ_ME_FIRST.md`](ai_models/_READ_ME_FIRST.md) · [`docs/architecture/repo-tree.md`](../docs/architecture/repo-tree.md).
