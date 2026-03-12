# Scripts

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
npx tsx scripts/build-template-library.ts --source="research/external-templates/raw-discovery/current"
```

Skriptet letar annars automatiskt efter råinput i denna ordning:

1. `research/external-templates/raw-discovery/current`
2. `research/external-templates/raw-discovery`
3. `_sidor/vercel_usecase_next_react_templates`
4. `research/_sidor/vercel_usecase_next_react_templates`
5. den äldre desktop-sökvägen

### Viktig arbetsordning

Kör i denna ordning när du vill bygga om forskningsytan reproducerbart:

```bash
npm run template-library:import-legacy
npm run template-library:hydrate-cache
npm run template-library:build
npm run template-library:embeddings
```

### Vad skriptet gör

1. Läser det kanoniska `summary.json`-kontraktet från raw discovery
2. Inspekterar shallow-clonade repos från `research/external-templates/repo-cache/`
3. Faller bara tillbaka till äldre `_sidor`-repo paths om den valda source-roten
   fortfarande pekar på en legacy-datasetmapp
4. Skapar `research/external-templates/reference-library/` med katalog + dossiers
5. Genererar kuraterade research-artefakter för runtime-sökning i `src/lib/gen/template-library/`
6. Genererar scaffold research metadata i `src/lib/gen/scaffolds/scaffold-research.generated.json`

### Produktionsgräns

Det här skriptet är build-time/research-time. Vercel-produktion ska läsa de
kuraterade JSON-filerna som commitas i repot, inte rå discovery, repo-cache
eller råa lokala datasetmappar.

## import-template-discovery.ts

Normaliserar discovery-data till den kanoniska research-lanen under
`research/external-templates/raw-discovery/current/`.

### Användning

```bash
npm run template-library:import-legacy
npx tsx scripts/import-template-discovery.ts --from="C:\\Users\\jakem\\Desktop\\_sidor\\vercel_usecase_next_react_templates\\summary.json"
npx tsx scripts/import-template-discovery.ts --from="research/external-templates/raw-discovery/current/playwright-catalog.json" --format=playwright-catalog
```

## hydrate-template-library-cache.ts

Gor shallow clones av GitHub-repon som refereras i den kanoniska raw-discoveryn.

### Användning

```bash
npm run template-library:hydrate-cache
npx tsx scripts/hydrate-template-library-cache.ts --max=20
```

### Regler

- shallow clone only
- ingen `install` eller `build`
- output hamnar i `research/external-templates/repo-cache/` som ar git-ignorerad
- `repo-cache` betyder lokal repo-spegel, inte runtime-cache
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

Historiskt hette discovery-flödet `scaffolds:discover`, men det producerar inte
interna runtime-scaffolds. Nu kör det Playwright-baserad extern
template-discovery som normaliseras till `research/external-templates/raw-discovery/current/`.

Använd i första hand:

```bash
npm run references:discover
npm run references:discover:second-pass
npm run references:discover:full
```

Kompatibilitetsalias finns kvar:

```bash
npm run scaffolds:discover
npm run scaffolds:discover:full
```
