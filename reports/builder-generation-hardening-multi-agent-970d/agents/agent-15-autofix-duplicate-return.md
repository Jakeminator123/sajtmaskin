## Agent 15 — Autofix vs duplicate top-level return

### What mechanical fix exists

- **Ingen** dedikerad fix för top-level / dubbel `return` i samma funktion.  
- **Ja:** `fixDuplicateDefaultExport` i `import-validator.ts` (dubbel `export default`).

### Risk of cascading fixes (64)

Autofix-pass-antal kommer från manifest (`syntaxFixPasses` etc.), inte 64. Högt `fixCount` i logg = många små fixar från trasig upstream-kod.

### Confidence (%)

Ingen top-level-return-fix: **~95%**.

### Improvements

- AST-regel för `return` outside function (med stor försiktighet).  
- Telemetri på esbuild-felmönster.

**Model:** composer-2-fast (subagent)
