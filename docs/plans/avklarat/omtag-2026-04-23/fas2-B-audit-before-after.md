# Fas 2·B — Landing-variant audit, before/after

**Branch:** `omtag/fas2-B-scaffold-variant-cleanup`
**Datum:** 2026-04-23
**Script:** `npx tsx scripts/scaffolds/eval-landing-variants.ts` (20 prompts, kuraterade per variant i `data/scaffold-eval/landing-variant-prompts.json`).
**OpenAI embedding:** `text-embedding-3-small`, 1536d.

## Sammanfattning

Den 2026-04-18 visade landing-audit att `corporate-grid` (default) vann 0/20 trots att det är den tänkta defaulten. Fas 2·B löser det genom en kombination av Väg A (regenerera variant-embeddings med rikare B2B-semantik) och en mikro-justering i `pickScaffoldVariantAsync` som låter en *dominant* cosine-vinst slå igenom utan hash-rotation. Resultat: corporate-grid vinner 4/4 på B2B-kurerade prompts och samtliga fem kärnvarianter träffar 4/4 på sina respektive förväntade prompts.

Default-rollen kvarstår på `corporate-grid` enligt guldrapporten; ingen Väg B-dokumentation behövs.

## Audit 2026-04-18 (innan fas 2·B)

Källa: `data/scaffold-eval/reports/landing-variant-latest.json` på branchpoint (commit `a7dd0abcc`).

| Variant | Total wins | Expected wins | Keyword coverage |
|---|---|---|---|
| `nature-flow` | 7/20 | 2/4 | 3/4 |
| `bold-startup` | 6/20 | 2/4 | 4/4 |
| `warm-local` | 4/20 | 1/4 | 3/4 |
| `editorial-lux` | 3/20 | 1/4 | 4/4 |
| `corporate-grid` (default) | **0/20** | **0/4** | 3/4 |

Empirisk vinnare enligt rådatan: `nature-flow` (7/20). `corporate-grid` rapporterades som `candidatesForRemoval`. Root cause: corporate-grid var top-cosine för B2B/consulting-prompts, men `pickScaffoldVariantAsync` hash-roterade alltid mellan top-3 kandidater, så dominanta embedding-vinster togs bort av randomization.

## Audit post-fas2B (efter M1 + E7)

Källa: `data/scaffold-eval/reports/landing-variant-post-fas2B.json` (2026-04-23T09:53Z).

| Variant | Total wins | Expected wins | Keyword coverage |
|---|---|---|---|
| `bold-startup` | 4/20 | 4/4 | 4/4 |
| **`corporate-grid` (default)** | **4/20** | **4/4** | 4/4 |
| `editorial-lux` | 4/20 | 4/4 | 4/4 |
| `nature-flow` | 4/20 | 4/4 | 3/4 |
| `warm-local` | 4/20 | 4/4 | 3/4 |
| `minimalist-mag` *(ny — flyttad från merged scaffold)* | 0/20 | — | 3/4 |
| `warm-editorial` *(ny — flyttad från merged scaffold)* | 0/20 | — | 4/4 |

Totalt 20/20 exact matches (upp från 6/20 = 30 % innan). `corporate-grid` vinner samtliga 4 B2B-prompts. Acceptance-kriterium "corporate-grid vinner minst 4/20 på kuraterade B2B-prompts (väg A)" uppfyllt.

`minimalist-mag` och `warm-editorial` ärvdes från den legacy marketing-scaffolden som slogs ihop med landing-page i M1. De har inga expected-prompts i den aktuella audit-svit och vinner därför inte, men de kvarstår som valbara stil-varianter (magazine / content-first).

## Val av väg

**Väg A** (regenerera variant-embeddings + justera variant-meta) + en komplementär justering i `pickScaffoldVariantAsync` (dominant-margin-check).

### Vad som ändrades

1. `config/scaffold-variants/landing-page/corporate-grid.json` — utökad `description`, utökade `keywords` (lade till `consultancy`, `compliance`, `fintech`, `law`, `legal`, `accounting`, `advisory`, `management consulting`, `företagskunder`, `redovisningsbyrå`, `juridikbyrå`, `advokatbyrå`, `advokat`, `revisor`, `finanskonsult`, `konsultbolag`), förtydligad `signatureMotif`, ny `promptHints[0]` som explicit namnger B2B/enterprise/consulting/agency/finance/legal/accounting-domänen.
2. `config/scaffold-variants/_index/variant-embeddings.json` — regenererad via `npx tsx scripts/scaffolds/generate-variant-embeddings.ts` mot `text-embedding-3-small`, 1536d. Antal varianter: 26 (oförändrat, inkluderar `minimalist-mag` och `warm-editorial` under `landing-page` efter M1-merge).
3. `src/lib/gen/scaffold-variants/matcher.ts` — `pickScaffoldVariantAsync` byter ut blind hash-rotation över top-3 mot en *dominant-margin*-regel: om toppkandidatens cosine leder över #2 med ≥ `0.05` vinner den rakt av; annars hash-roterar bland kandidater inom marginen (kvarstående variation mellan sessioner när cosine-fältet är jämnt, men dominanta embedding-vinster skyddas).

### Varför inte Väg B

Empirisk `nature-flow`-swap (6/20 wins på hela sviten, 2/4 på sina egna prompts) hade gett en ny default som inte bättre speglar B2B-kuraterade fall. Guldrapporten signalerade explicit att default-rollen kvarstår om root-cause-fixen bär — vilket den nu gör.

## Reproduktion

```bash
# 1. Installera deps (om worktree är färsk)
npm install

# 2. Regenerera variant-embeddings (kräver OPENAI_API_KEY)
npx tsx scripts/scaffolds/generate-variant-embeddings.ts

# 3. Kör landing-variant audit
npx tsx scripts/scaffolds/eval-landing-variants.ts

# 4. Läs resultatet
cat data/scaffold-eval/reports/landing-variant-latest.json
```

## Filer som ändrades i E7

- `config/scaffold-variants/landing-page/corporate-grid.json`
- `config/scaffold-variants/_index/variant-embeddings.json`
- `src/lib/gen/scaffold-variants/matcher.ts`
- `data/scaffold-eval/reports/landing-variant-latest.json` (genererad)
- `data/scaffold-eval/reports/landing-variant-post-fas2B.json` (genererad, frusen post-fas2B-stamp)

## Kopplat arbete

- **M1** (samma branch): content-site mergad in i landing-page. `warm-editorial` och `minimalist-mag` lever nu som landing-page-varianter. Se `docs/architecture/glossary.md` § Legacy och `src/lib/gen/scaffolds/registry.ts` för detaljer.
