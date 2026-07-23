# Scripts

`package.json` är den kanoniska listan över körbara npm-kommandon. Den här filen
är endast en orientering till scriptägare; den ska inte återge hela
scriptinventariet eller historiken för borttagna pipelines.

## Börja här

| Behov | Kommando eller ägare |
| --- | --- |
| Repo-verifiering | `npm run typecheck`, `npm run lint`, `npm run test:ci` |
| Genererade kontraktsdocs | `npm run docs:generate`, `npm run docs:check`, `npm run docs:test` |
| Aktiva dokumentationslänkar | `npm run docs:links` |
| Historiska planstatusar | `npm run plans:history:check`, [`plans/`](plans/) |
| Scaffolds | `npm run scaffolds:validate`, [`scaffolds/`](scaffolds/) |
| Dossiers | `npm run dossiers:validate-all`, [`dossiers/`](dossiers/) |
| Control plane | `npm run control-plane:check`, [`control-plane/`](control-plane/) |
| Databas och migrationer | [`db/`](db/) — prod-migrationer appliceras av CI-jobben `prod-migrations-apply`/`prod-migrations-applied` (`db/migrate-prod.mjs` + `db/check-migrations-applied.mjs`), inte av Vercel-deployen |
| Env-drift | [`env/`](env/), [`../docs/ENV.md`](../docs/ENV.md) |
| Preview-host | [`../preview-host/README.md`](../preview-host/README.md) |
| Eval | [`eval/`](eval/) |
| Observability | [`observability/`](observability/) |

## Viktiga gränser

- `scripts/docs/` genererar och verifierar projektioner. Runtime-ägaren ligger i
  respektive manifest, registry, schema eller policy.
- `scripts/dossiers/` är curator-/valideringsverktyg. Runtime-registret läser
  dossiermanifesten direkt.
- `scripts/v0-templates/` hanterar galleriets Template (v0-mall)-spår. Det är
  inte samma system som scaffold eller dossier.
- `scripts/scaffolds/` får inte skapa ett parallellt scaffold-registry.
- Databas- och env-script ska använda repots befintliga guards; kringgå inte
  target-, migration- eller secret-kontroller.

## CI

Det faktiska mergekontraktet finns i
[`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) och övriga workflows
under `.github/workflows/`. Påstå inte att ett lokalt kommando är blockerande om
det inte finns i aktuell workflow eller branch protection.

Vid avvikelse gäller i ordning:

1. runtimeägaren för faktatypen,
2. `package.json` för kommandon,
3. aktuell workflow för CI-beteende,
4. denna orientering.

Borttagna script och pipelines finns i git-historiken. Lägg inte tillbaka deras
kommandon här som historisk inventering.
