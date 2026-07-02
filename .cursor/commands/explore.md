# Explore

Read-only kodbasutforskning. Använd när du vill få en tabell, karta, scorecard, risklista eller snabb audit utan att agenten ändrar filer.

## Grundregel

Ändra inga filer, skapa inga commits och starta inga långkörande dev-/preview-sessioner. Svara med fynd + filreferenser + nästa rekommenderade steg.

## Arbetsflöde

1. Tolka användarens fråga till ett smalt scope.
2. Läs relevanta repo-router-filer först vid osäkerhet:
   - `docs/README.md`
   - `AGENTS.md`
   - `docs/architecture/code-map.md`
   - `docs/architecture/glossary.md`
   - `docs/plans/active/README.md`
3. Sök i kod, inte bara docs. Kod är source of truth.
4. Om frågan gäller builder/generation/repair: börja i `src/lib/gen/`, `src/lib/providers/own-engine/`, `src/app/api/engine/`, `src/components/builder/`.
5. Om frågan gäller deploy: börja i `src/app/api/v0/deployments/route.ts`, `src/lib/deploy/`, `docs/ENV.md`.
6. Om frågan gäller backoffice: börja i `sajtmaskin_backoffice.py` och `backoffice/pages/`.

## Output-format

För översikter och jämförelser: tabell först.

```markdown
| Område | Bedömning | Bevis | Nästa steg |
|---|---|---|---|
| ... | ... | `path/to/file.ts` | ... |
```

För scorecards:

```markdown
## Sajtmaskin Scorecard — <branch/tid>

**Betyg: X.Y / 10** (produktionsmognad ~XX%)

| Område | Betyg | Kommentar |
|---|---:|---|
| Arkitektur | | |
| Kodkvalitet | | |
| Test/CI | | |
| Säkerhet | | |
| Drift/deploy | | |
| Underhållbarhet | | |

### Det Som Är Bra

### Det Som Drar Ner Betyget

### Senaste Commit Före Nu
```

## Regler

- Citera filer med `path/to/file.ts`; ta med radnummer bara om du faktiskt läst dem.
- Skilj **GLASKLAR**, **KRÄVER ANALYS**, **INTE FIXA** vid triage.
- Markera om något är subjektiv bedömning snarare än verifierat fel.
- Om du hittar en uppenbar bug: föreslå fix, men implementera inte utan ny explicit instruktion.
- Undvik browser mot `/builder?...` om användaren kan ha en aktiv builder-session.
