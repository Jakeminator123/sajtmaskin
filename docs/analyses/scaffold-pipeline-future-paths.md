# Scaffold/Template Pipeline — tre alternativa spar

> **Lägesnotis (2026-03-21):** Dossiers ligger i `research/dossiers/`; det finns
> inget `scaffold-pipeline/`-träd eller `npm run scaffold-pipeline` längre.
> Byggkommandon: `scaffolds:*` och `research:normalize` / `template-library:build` i `package.json`.
> Se `docs/architecture/scaffold-lane-model.md` för den kanoniska tre-zone-modellen.

Sparad: 2026-03-20
Kontext: Efter hybridisering av scaffold-systemet (17 scaffolds, site-profile,
route bucketing, embedding-guardrails). Fragan ar hur man gor nasta steg for
att hamta och anvanda externa templates/repos battre.

---

## Spar A: Template-search MCP-server (rekommenderat forsta steg)

### Vad det loser
Idag kan ingen agent fraga "vilka e-handelsmallar finns?" eller "jamfor
vara restaurangsidor med externa templates" utan att manuellt veta ratt ID.
En MCP-server exponerar befintlig sok- och jamforelselogik till agenter.

### Implementation
- Ny fil: `tools/mcp/template-search-server.ts`
- Samma monster som `tools/mcp/engine-server.ts`
- ~200 rader TypeScript, inga nya dependencies

### Verktyg som exponeras

```
search_templates(query, topK)
  -> anropar searchTemplateLibrary() fran src/lib/gen/template-library/search.ts

list_template_categories()
  -> grupperar template-library.generated.json per categorySlug

get_template_dossier(templateId)
  -> laser manifest.json + summary.md fran research/dossiers/

compare_template_to_scaffold(templateId, scaffoldId)
  -> hamtar dossier + scaffold manifest, jamfor struktur

list_scaffolds()
  -> anropar getAllScaffolds() fran registry.ts

search_scaffolds_by_prompt(prompt)
  -> anropar matchScaffold() fran matcher.ts
```

### Uppskattning
- 2-3 timmar arbete
- Ingen ny dependency
- Registreras i `.cursor/mcp.json`

### Nar
Gor det nar du vill att agenter ska kunna resonera om scaffolds och
template-referenser utan att du manuellt ger dem ID:n.

---

## Spar B: Automatisk ingestion (CI/cron)

### Vad det loser
Idag kors `scaffolds:build` / `templates:refresh` + embeddings manuellt. Om
Vercel lagger till nya templates eller repos uppdateras marks det inte forran
nasta manuella kor.

### Implementation
- GitHub Actions workflow som kor t.ex. `npm run scaffolds:build` och/eller
  `npm run templates:refresh && npm run templates:embeddings` pa schedule
- PR skapas automatiskt med uppdaterade generated JSON-filer
- Du reviewar och mergar

### Alternativ: lokal cron
- Windows Task Scheduler kor samma npm-skript en gang per vecka
- Resultatet committas lokalt

### Uppskattning
- 1-2 timmar for GitHub Actions
- Kostnad: beror pa antal mallar och embedding-anrop (10 runtime-scaffolds + galleri)

### Nar
Gor det nar du har storre team eller ofta andrad pipeline-data. Idag racker
manuell korning fran repo-root.

---

## Spar C: Direkt Vercel API-ingestion

### Vad det loser
Playwright-baserad scraping ar fragil (beroende av HTML-struktur pa
vercel.com/templates). Om Vercel exponerar ett publikt template-API kan
vi hamta data renare och snabbare.

### Problem
Vercel har INGET publikt "list all templates" API. Vercel MCP-servern har
18 verktyg men INGET for template-katalog. Det enda sattet idag ar scraping.

### Mojlig framtida vag
- Vercel kan lyfta in template-sok i sitt MCP (tex `search_templates`)
- Om det hander: byt ut Playwright-steget mot MCP-anrop
- Resten av pipelinen (dossiers, embeddings) forblir oforandrad

### Uppskattning
- 0 timmar nu (inget att bygga, API:t finns inte)
- Bevaka Vercel MCP-uppdateringar

### Nar
Gor ingenting nu. Bevaka Vercels MCP-changelog. Om de lagger till
template-sok, byt ut steg 1 i pipelinen.

---

## Prioriteringsordning

1. **A (MCP-server)** — lagst insats, hogst vardagsvarde
2. **B (automatisk ingestion)** — nar skalan kraver det
3. **C (Vercel API)** — nar/om Vercel exponerar det

## Relation till befintliga MCP-servrar

| Server | Vad den gor | Relation till dessa spar |
|---|---|---|
| `sajtmaskin-scaffolds` | Inspekterar de 10 runtime scaffolds | Spar A utvidgar med template-sokning |
| `sajtmaskin-engine` | Genererar sajter, hamtar genererad kod | Oberoende |
| `Vercel` MCP | Deployments, projekt, docs | Spar C beror pa om de lagger till templates |
| `v0` MCP | v0 chattar och generering | Oberoende |
