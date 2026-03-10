# Nästa steg — Sajtmaskin

> Senast uppdaterad: 2026-03-10
> Motor: Egen kodgenerering (GPT-5.4 / GPT-5.3 Codex via OpenAI direkt)
> Branch: `egen-motor-v2`

## Genomfört

### Starter-scaffolds
10 interna scaffolds (landing-page, portfolio, blog, ecommerce, saas-landing,
auth-pages, dashboard, app-shell, content-site, base-nextjs) med:
- Keyword + embedding-baserad matchning
- Neutrala grå färgtoken (hue 0) som modellen MÅSTE byta ut
- Inspirational vs structural serialiseringsläge
- Locked/flexible-kontrakt i system-prompten

### Post-generation autofix pipeline
8-stegs autofix + validate-and-fix loop:
- use-client, import-validator, react-import, font-import, syntax-validator,
  jsx-checker, dep-completer, security
- Cross-file import checker (stubbar saknade filer)
- Project-sanity validator (post-merge)
- Hardened rebuildContent (file-path-aware) + scaffold-import-checker (regex)

### Preview
- Stubs för saknade imports (renderar placeholder istället för att krascha)
- normalizeTranspiledModule tar bort require() för saknade lokala imports
- Unsplash query-normalisering (trunkering + retry)

### MCP-servrar
- sajtmaskin-generated-code (hämta/generera kod)
- sajtmaskin-scaffolds (utforska interna scaffolds)
- Vercel MCP (docs, deploys)
- OpenClaw-integration med filkontext

### On-demand komponentbibliotek
- shadcn snippets laddas on-demand
- registry-enricher, async system prompt

## Kvar att göra

### 1. Builder reliability (hög prioritet)
- Versionshistorik: effektiva versionslistan ska användas konsekvent i UI
- Inspector: normalisera URL:er för egna previews
- UI-tydlighet: visa scaffold, aktiv version, motorval
- Förbättra-knappens semantik

### 2. DB-konsolidering (medel prioritet)
Migrera engine-chattdata (SQLite) till Postgres/Drizzle.
Eliminera dual-chat-ambiguitet mellan SQLite och Postgres.

### 3. Progressiv preview (medel prioritet)
Detektera kompletta filblock under SSE-streaming och rendera partiell
preview innan generationen är klar (~10-15s istället för ~100s).

### 4. Bättre bildfallback (låg prioritet)
Pexels API som fallback när Unsplash ger noll träffar.

### 5. Env-namnstädning (låg prioritet)
Byt `V0_MAX_PROMPT_LENGTH` etc. till motoragnostiska namn.

## Arkitekturprinciper

- **Scaffolds** är flexibla startpunkter, inte rigida mallar
- **Vercel templates** (`_template_refs/`) är researchmaterial, inte runtime-input
- **Egen motor** är default (`V0_FALLBACK_BUILDER` != "y")
- **v0-prefix** i interna ID:n är historiskt arv, inte indikation på v0 API-användning
- **Locked**: versioner, fonter, config, shadcn, token-namn
- **Flexible**: färger, sidantal, routes, layout, komponenter, copy
