# Scripts

## download-docs.py

Ett enkelt Python-skript för att ladda ner dokumentation till MCP-servern.

### Användning

```bash
python scripts/download-docs.py
```

Skriptet frågar interaktivt efter en URL och laddar ner dokumentationen till
`services/mpc/docs/` där MCP-servern automatiskt kan använda den.

### Exempel

När du kör skriptet:

```
📥 URL: https://ai-sdk.dev/docs
```

Skriptet kommer att:

1. Ladda ner dokumentationen från URL:en
2. Spara den i `services/mpc/docs/docgrab__[domän]__[sökväg]/`
3. Göra den sökbar via MCP-serverns `search_docs` tool

### Tips

- Ange fullständig URL (t.ex. `https://ai-sdk.dev/docs`)
- Dokumentationen indexeras automatiskt av MCP-servern
- Starta om MCP-servern (eller vänta tills Cursor startar den) för att den nya dokumentationen ska bli sökbar

### Vanliga dokumentationskällor

- `https://ai-sdk.dev/docs` - AI SDK dokumentation
- `https://platform.openai.com/docs` - OpenAI API dokumentation
- `https://v0.dev/docs` - v0 API dokumentation
- `https://vercel.com/docs` - Vercel platform dokumentation

## sync-scaffold-refs.mjs

Hämtar externa GitHub-referenser till `_template_refs/` för scaffold- och hemsidemallsarbete.

**OBS:** `_template_refs/` används inte vid runtime. Skriptet behövs endast om du utvecklar nya scaffolds från externa referenser. Se `_template_refs/README.md` för mer information.

### Användning

```bash
node scripts/sync-scaffold-refs.mjs
node scripts/sync-scaffold-refs.mjs --force
node scripts/sync-scaffold-refs.mjs --only=nextjs-saas-starter,ibelick-nim
```

### Vad skriptet gör

1. Klonar eller sparse-checkout:ar utvalda referensrepon
2. Sparar dem under `_template_refs/`
3. Gör det lättare att hålla scaffold-kandidater reproducerbara mellan chats

### Exempel på referenser

- `nextjs/saas-starter`
- `auth0-developer-hub/auth0-b2b-saas-starter`
- `dzlau/stripe-supabase-saas-template`
- `vercel/examples` (`solutions/blog`)
- `vercel/next.js` (`examples/blog-starter`, `examples/with-cloudinary`)

## build-template-library.ts

Auditerar rå extern template-research och bygger ett kuraterat
`reference-library`-lager för agenter och scaffold-arbete.

### Användning

```bash
npm run template-library:build
npx tsx scripts/build-template-library.ts --source="C:\\Users\\jakem\\Desktop\\_sidor\\vercel_usecase_next_react_templates"
```

Skriptet letar annars automatiskt efter råinput i denna ordning:

1. `research/external-templates/raw-discovery`
2. `_sidor/vercel_usecase_next_react_templates`
3. `research/_sidor/vercel_usecase_next_react_templates`
4. den äldre desktop-sökvägen

### Vad skriptet gör

1. Läser `summary.json`, `metadata.json`, `INFO_SV.md` och klonade repo-mappar
2. Validerar repo-URL:er, framework-fit och monorepo-signaler
3. Skapar `research/external-templates/reference-library/` med katalog + dossiers
4. Genererar kuraterade research-artefakter för runtime-sökning i `src/lib/gen/template-library/`
5. Genererar scaffold research metadata i `src/lib/gen/scaffolds/scaffold-research.generated.json`

### Produktionsgräns

Det här skriptet är build-time/research-time. Vercel-produktion ska läsa de
kuraterade JSON-filerna som commitas i repot, inte rå discovery eller råa
lokala datasetmappar.

### Begrepp

- `research/external-templates/raw-discovery/`
  Rå och brusig discovery-output. Bra för triage, inte canonical.
- `research/external-templates/reference-library/`
  Kuraterad extern referensyta med per-template dossiers.
- `src/lib/gen/template-library/`
  Genererade research-artefakter som används av kod vid sökning och promptstöd.
- `src/lib/gen/scaffolds/`
  Den riktiga runtime-scaffold-registryt.

## generate-template-library-embeddings.ts

Genererar embeddings för den kuraterade externa referensytan så att agenter och
framtida scaffold-logik kan söka semantiskt i externa referensmallar.

### Användning

```bash
npm run template-library:embeddings
```

## scaffolds:validate

Kör manifestvalidering för de interna runtime-scaffolds som redan finns i
`src/lib/gen/scaffolds/`.

```bash
npm run scaffolds:validate
```

## devtest

Kör en konservativ repo-smoke-test för vanlig utveckling efter större
struktur- eller dokumentationsändringar.

Ingår:

1. `npm run typecheck`
2. `npm run scaffolds:validate`
3. `npm run test:ci`
4. `npm run lint`

```bash
npm run devtest
```

Detta inkluderar inte `next build` som standard, så att kommandot förblir ett
snabbare utvecklingstest snarare än en tyngre release-validering. `lint` körs
sist för att ge mer verifieringssignal även när repot redan har kända lintfel.

## references:discover / scaffolds:discover

Historiskt har discovery-skriptet hetat `scaffolds:discover`, men det producerar
inte interna runtime-scaffolds. Det producerar rå extern template-discovery.

Använd i första hand:

```bash
npm run references:discover
npm run references:discover:full
```

Kompatibilitetsalias finns kvar:

```bash
npm run scaffolds:discover
npm run scaffolds:discover:full
```
