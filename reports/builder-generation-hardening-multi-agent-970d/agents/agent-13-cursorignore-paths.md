## Agent 13 — Ignored paths and investigation hygiene

### What is ignored

- `.gitignore`: `data/prompt-dumps/*` (utom README), `logs/*`, `.env*`.  
- `.cursorignore`: blandade kommenterade rader; whitelist `!logs/generationslogg/**` m.m. — **effektiv indexering** kan skilja sig från git.

### Safe read-only access pattern

- Öppna med **explicit sökväg** / `@` / Read tool — lita inte på semantisk sökning.  
- Committa inte dumps; kopiera **sanerade** utdrag till issues/rapporter.  
- För env-form: `docs/ENV.md` + `src/lib/env.ts`, inte innehåll i `.env.local`.

### Confidence (%)

`.gitignore`: **~95%**. `.cursorignore` exakt beteende i Cursor: **~65%**.

### Improvements

- Återaktivera tydlig parent-ignore + undantag om whitelist ska vara deterministisk.

**Model:** composer-2-fast (subagent)
