# Färdiga prompter för cloudagenter (annat konto)

Arbetsledning: ägaren + Builder A i huvudchatten. En agent per prompt, en
aktivitet per agent. Prompterna förutsätter att den här planmappen finns på
`origin/master` — agenterna läser aktivitetsfilen som uppdragsspec.

## Körschema

| Våg | Prompt | Kan startas samtidigt | Startvillkor |
|---|---|---|---|
| 0 | — (ägaren mergar #1088 → #1087, fyller i dom-kolumnen i master-planen) | — | — |
| 1 | P1 (K1 registerförening) | ensam | #1087 mergad + domar ifyllda **och committade** |
| 2 | P2 (K2 hero), P3 (K3 redesign-layouts), P4 (K4 död logik) | alla tre parallellt | K1 mergad (eller åtminstone #1087 mergad — K1 rör bara registerdata och krockar inte med K2–K4) |
| 3 | P5 (K5 housekeeping) | ensam | K1–K4 mergade |

Efter varje våg: ägaren/Builder A granskar PR:erna mot aktivitetens
«Klart när» innan nästa våg släpps.

## Gemensam preamble (klistras in ÖVERST i varje prompt)

```text
Du är Builder i Sajtmaskin-repot (github.com/Jakeminator123/sajtmaskin).

Innan du gör något: läs AGENTS.md i repo-roten och följ dess läsordning.
Kritiska regler för dig:
- Arbeta på en egen branch från FÄRSK origin/master (git fetch först).
  Branchnamn: enligt uppgiften nedan.
- Rör ALDRIG brancher med "BRA" i namnet eller rescue/* — de är frysta
  backuper. Ingen force-push någonstans. Pusha aldrig till master.
- Ändra ENDAST det din aktivitetsfil kräver. Stage bara egna filer.
  Hittar du angränsande problem: rapportera i PR-beskrivningen, fixa inte.
- Terminologi: docs/architecture/glossary.md är kanonisk. Kodidentifierare
  och filnamn behåller legacy-namn — döp inte om.
- Öppna EN pull request mot master när verifieringen är grön. Merga inte.
  Beskriv i PR-body: vad, varför, verifieringsutfall (klistra in
  kommandoresultat), och eventuella avvikelser från aktivitetsfilen.
- Avsluta med en kort rapport: vad som gjordes, vad som INTE gjordes, öppna
  frågor till arbetsledningen.
```

## P1 — K1: registerförening + #1090-rebase (våg 1)

```text
UPPGIFT: Utför aktiviteten i
docs/plans/active/2026-08-21-scaffold-komposition-och-stad/aktiviteter/K1-registerforening-och-1090-rebase.md
Läs den filen som fullständig spec, plus master-planen i samma mapp
(00-master-plan.md) — särskilt beslutstabellen med ägarens domar, som du ska
applicera exakt.

Branch: chore/k1-addenda-reconcile
Utgå från branchen chore/b4-curate-variant-addenda (PR #1090) om den är
rebasebar mot master; annars ny branch från origin/master där du återskapar
#1090:s beslut enligt aktivitetsfilen.

STOPPVILLKOR: Om dom-kolumnen i master-planens beslutstabell är tom, eller om
PR #1087 inte är mergad till master — avbryt direkt och rapportera, gör inget.

Verifiering (alla ska vara gröna innan PR):
npm run typecheck
npm run scaffolds:validate
npm run templates:addenda:check
npx vitest run src/lib/gen/scaffold-variants/
python -m pytest backoffice/test_template_curator_catalog.py -q
```

## P2 — K2: hero-variation i filer (våg 2)

```text
UPPGIFT: Utför aktiviteten i
docs/plans/active/2026-08-21-scaffold-komposition-och-stad/aktiviteter/K2-hero-variation-i-filer.md
Läs den filen som fullständig spec plus master-planen (00-master-plan.md)
§ Belagt nuläge för bakgrunden.

Branch: feat/k2-hero-composition-variation

Kärnkrav i korthet (aktivitetsfilen äger detaljerna):
- landing-page behåller split-hero; saas-landing och portfolio får varsin
  TYDLIGT annorlunda hero-komposition i sina faktiska filer.
- Default-varianternas signaturePatterns.layouts uppdateras så fil och
  variant säger samma sak.
- Inga nya dependencies, inga nya routes, placeholder-copy-konventionen
  ([Rubrik], [Företagsnamn]) och svenska ankare behålls.
- Regenerera variant-embeddings när varianttexter ändrats.

Verifiering (alla ska vara gröna innan PR):
npm run typecheck
npm run scaffolds:validate
npm run scaffolds:variant-embeddings
npx vitest run src/lib/gen/scaffold-variants/variant-integrity.test.ts
Bifoga i PR-body: de tre hero-sektionernas nya grid-/layoutstruktur i ord.
```

## P3 — K3: redesign-follow-up får variantinspirationen (våg 2)

```text
UPPGIFT: Utför aktiviteten i
docs/plans/active/2026-08-21-scaffold-komposition-och-stad/aktiviteter/K3-redesign-follow-up-far-layouts.md
Läs den filen som fullständig spec. OBS: layouts når redan clear-redesign
(compact stängs av i build-dynamic-context.ts) — bygg inte det. Luckan är
att variantinspirationen (stillbild + addendum-utdrag) är init-only.

Branch: feat/k3-redesign-inspiration

Kärnkrav i korthet (aktivitetsfilen äger detaljerna):
- clear-redesign ska resolva variantTemplateInspiration på samma villkor som
  init (ej Importerat repo-läge, ej Scaffold: Av). Stillbildsbilagan följer
  med; källkvittot fortsätter spegla sanningen.
- Vanliga follow-ups (clear-refine, capability-*, neutral) ska vara
  byte-identiska mot innan — testlås på skillnaden.
- Uppdatera glossary-raden och docs/schemas/scaffold-contract.md («init och
  clear-redesign») i samma PR.

Verifiering (alla ska vara gröna innan PR):
npm run typecheck
npx vitest run src/lib/gen/system-prompt/ src/lib/gen/scaffold-variants/
Relevant follow-up-/orchestrate-test om du hittar ett befintligt.
Prompt-dump-stickprov beskrivet i aktivitetsfilen.
```

## P4 — K4: död logik (våg 2)

```text
UPPGIFT: Utför aktiviteten i
docs/plans/active/2026-08-21-scaffold-komposition-och-stad/aktiviteter/K4-dod-logik-scoring-research-tags.md
Läs den filen som fullständig spec.

Branch: chore/k4-dead-scaffold-logic

Kärnkrav i korthet (aktivitetsfilen äger detaljerna):
- Radera src/lib/gen/scaffolds/scaffold-scoring.ts + knip.json-posten,
  EFTER färsk grep som bevisar noll anropare. scripts/db/scaffold-scores.mjs
  och Backoffice-sidan behålls.
- Research-merge i registry.ts: sök konsumenter av varje research-fält efter
  #1087; behåll det som läses, ta bort det som inte läses.
- tags: behåll + dokumentera som embeddings-only (rekommenderat), radera inte
  utan att embeddings-parity är grön.
- Dubbel variant-pick: utred och dokumentera; slå ihop bara om trivialt.
- Duplicera INTE #1087:s borttagningar — verifiera i stället att inget
  referenceTemplates/templateRecommendations-spår blev kvar.

Verifiering (alla ska vara gröna innan PR):
npm run typecheck
npm run scaffolds:validate
npm run test:ci -- (eller åtminstone dead-code-lanen och scaffold-sviterna)
Bifoga grep-bevis för raderade symboler i PR-body.
```

## P5 — K5: housekeeping-svep (våg 3)

```text
UPPGIFT: Utför aktiviteten i
docs/plans/active/2026-08-21-scaffold-komposition-och-stad/aktiviteter/K5-housekeeping-scheman-policys-docs.md
Läs den filen som fullständig spec.

Branch: chore/k5-housekeeping-sweep

STOPPVILLKOR: Kör bara om K1–K4-PR:erna är mergade till master. Annars
avbryt och rapportera vilka som saknas.

Kärnkrav i korthet (aktivitetsfilen äger detaljerna):
- Synka strikta scheman, control-plane-register, genererade docs,
  embeddings, handskrivna kontrakt och Backoffice-speglar med slutläget.
- Lägg app-shell-fyndet (0 % preview-OK, 5 av 5, telemetri 11–19 aug) som
  rad i BUG-SWARM-BACKLOG.md § Aktiv kö om det saknas — fixa inte buggen.
- Uppdatera planmappens status + B4-raderna i briefing-planen.

Verifiering (alla ska vara gröna innan PR):
npm run devtest
npm run docs:generate && npm run docs:check && npm run docs:links
npm run embeddings:ensure
python -m pytest backoffice/ -q
```
