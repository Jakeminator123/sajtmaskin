# Scaffolds-spåret — vad som är kvar

Commits hittills:
- `11c621881` scaffolds 1/3 — v1: env-flagga, scaffold-ankrad template guidance, backoffice-toggle, tester, docs
- `0985b8ae1` scaffolds 2/3 — v1.5: prompt-aware reranking, e2e-bevistester, registry-kommentar, glossary
- `<denna commit>` scaffolds 3/3 — Next.js version bump (16.2.1→16.2.3), testrapport

## Kvar att göra (prioritetsordning)

### Hög prioritet

1. **Contract gate äter init-banan**
   När contract gate triggar och användaren svarar körs kodgenereringen som follow-up.
   Init-only features (template guidance) kan missas. Behöver antingen:
   - propagera template guidance till follow-up efter contract gate
   - eller låta den första kodgenereringen behålla `generationMode: "init"`

2. **Import-disciplin i genererad kod**
   38 av 72 autofix var saknade imports. Bör stärkas i systemprompt (`## Import Rules`)
   eller i autofix-pipeline (mekanisk import-komplettering).

3. **Thinking-routing**
   Thinking var av trots `SAJTMASKIN_DEFAULT_THINKING=true`. Undersök varför.
   Överväg att tvinga thinking vid create-chat init eller vid ecommerce/heavy context.

### Medel prioritet

4. **Cart-provider cross-file-kedja**
   LLM:en missar konsekvent att wrappa `<CartProvider>` i root layout och att importera
   `useCart`/`StoreProduct` i konsumentfiler. Möjliga åtgärder:
   - Systemprompt: "When generating React Context patterns, always wrap the provider in layout.tsx"
   - Autofix: lär sig `useCart`-mönstret
   - Verifier: flagga saknad provider-wrapping

5. **Contract gate UX**
   Mjuka tröskel för enklare e-handels-prompter (mockdata/demo borde inte blockera).

6. **`ENV_VAR_ENCRYPTION_KEY`**
   Saknas i `.env.local`. Behövs för projektpanelens env-var-sparning.

### Låg prioritet / framtida

7. **Template guidance v1.75** — ev. små selectedFiles-excerpts (layout/section-nära)
8. **Template guidance v2** — ev. global template-library search i runtime
9. **WSS/HMR till Fly** — WebSocket-proxy tappar connection
10. **Hydration error overlay** — pre-existerande på landningssidan
11. **`rocket-logo.webp` preload** — ofarlig varning
