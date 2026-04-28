## Agent 07 — Linux vs local env parity

### Relevant env knobs (names only from docs/code)

Se `docs/ENV.md`, `config/env-policy.json` och `src/lib/env.ts` (`serverSchema`) för timeout-, preview-host-, cache- och modell-relaterade nycklar — lista inte härledda env-namn i rapporten (undviker falska träffar i hemlighetsskanning).

`.env.local` är gitignored — inget innehåll antaget här.

### Parity risks

| Risk | Linux CI vs Mac dev |
|------|---------------------|
| Sökvägar / cache | `DATA_DIR`, typecheck-cache — kall CI |
| Timeouts | Verifier/stream/route duration |
| Preview-host | Olika `BASE_URL` / suffix / API key |
| Secrets / modeller | Olika keys och overrides |

### Confidence env explains Nordtak (%)

**~10% (låg)** utan faktisk logg-diff; env förklarar generiska skillnader, inte en specifik prompt utan data.

### Improvements

- Speglade flags i CI vs dev-policy.  
- Explicit cache root i CI.  
- Logga **resolved** timeouts och modell per körning.

**Model:** composer-2-fast (subagent)
