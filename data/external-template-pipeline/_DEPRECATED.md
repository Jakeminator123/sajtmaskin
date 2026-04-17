# DEPRECATED — gamla template-library-pipen

**Status:** Avvecklas i Fas 9 (se `docs/architecture/dossier-pipeline-roadmap.md`).

Allt under denna mapp tillhör den **gamla** template-library-pipelinen som
ersätts av den nya dossier-pipelinen under `data/dossiers/`.

## Vad finns här

- `repo-cache/` — gamla pipens klonade Vercel-repon (~XXX MB)
- `scrape-cache/` — gamla pipens skrap-output
- `raw-discovery/` — gamla pipens normaliserade discovery-data
- `reports/` — utvärderingar / scaffold-candidate-rapporter

(`reference-library/dossiers/` raderades 2026-04-17 efter att 97 dossiers ersatts av nya pipen.)

## Varför ligger det kvar

Två filer som **runtime läser** är genererade härifrån:
- `src/lib/gen/template-library/template-library.generated.json`
- `src/lib/gen/scaffolds/scaffold-research.generated.json`

De är `gitignored` så de finns bara på maskiner där gamla pipens build-skript
har körts. Att radera `data/external-template-pipeline/` på en maskin betyder
att dessa filer inte kan regenereras där förrän runtime migrerats till nya
dossier-formatet (Fas 6).

## Hur du städar bort

När runtime är migrerat till nya dossier-pipen (efter Fas 6 i roadmap):

```bash
# Säkerhetscheck först:
ls src/lib/gen/template-library/template-library.generated.json
ls src/lib/gen/scaffolds/scaffold-research.generated.json

# Om båda kan tas bort (orchestrate.ts läser inte längre dem):
rm -rf data/external-template-pipeline/
rm src/lib/gen/template-library/template-library.generated.json
rm src/lib/gen/scaffolds/scaffold-research.generated.json
```

Och avveckla skripten enligt Fas 9-listan i `dossier-pipeline-roadmap.md`.

## Hänvisningar

- Nya pipen: `data/dossiers/`
- Lane-karta: `docs/architecture/template-scaffold-lane.md`
- Roadmap: `docs/architecture/dossier-pipeline-roadmap.md`
