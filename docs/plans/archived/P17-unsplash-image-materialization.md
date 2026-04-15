# P17 — Unsplash image materialization stabilization

Status: Steg 1–3 implementerade, steg 4 verifierat med tester
Skapad: 2026-04-15
Prioritet: Hög (diagnostik klar — återstår end-to-end repro med riktig env)

## Problem

`UNSPLASH_ACCESS_KEY` finns satt i lokal env, men pipeline-beteendet upplevs fortfarande som om nyckeln saknas i vissa körningar. Det blockerar tillförlitlig bildmaterialisering i finalize-flödet.

## Mål

Göra bildmaterialisering deterministisk och felsökningsbar:

1. Tydligt skilja på "saknad nyckel", "ogiltig nyckel", "rate limit", och "upstream-fel".
2. Säkerställa att runtime verkligen läser aktuell env i den process som kör finalize/materialisering.
3. Behålla graceful degradation (ingen krasch), men ge mer precis signal i loggar/UI.

## Scope

- `src/lib/gen/post-process/image-materializer.ts`
- Eventuell callsite i finalize/pipeline där materializer-resultat summeras
- Relevanta tester för materializer/finalize

## Genomförande

### Steg 1 — Repro och evidens

- Reproducera ett fall med materialisering i dev.
- Bekräfta om processen som kör finalize startade före/efter senaste env-ändring.
- Samla nuvarande loggsignal för skip/fail/success.

### Steg 2 — Diagnostiknivå

- Normalisera felklassning i materializer:
  - `missing_key`
  - `invalid_key_or_unauthorized`
  - `rate_limited`
  - `network_or_provider_error`
- Logga klassning med säker maskning (inga secrets i logg).

### Steg 3 — Runtime-konsistens

- Säkerställ att env läses från rätt källa i servercontext.
- Dokumentera om dev-server restart krävs efter env-ändring och när.

### Steg 4 — Verifiering

- Testa:
  - med giltig key (minst en bild materialiseras)
  - utan key (graceful skip + tydlig reason)
  - simulerad 401/429 (rätt reason-klassning)

## Acceptanskriterier

- Inga tvetydiga "saknad nyckel"-loggar när key finns i aktiv process.
- Materializer-resultat innehåller tydlig reason-kod vid skip/fail.
- Ingen regress i finalize; generation fortsätter även vid extern bild-fail.

## Ej i denna plan

- Byta bildprovider
- Större omdesign av bildprompt/logik
