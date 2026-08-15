# K2 — Katalogklick stage:as: placering + nycklar före generering

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

Klick på ett block i Bläddra katalog skickar **omedelbart**
`Lägg till byggblocket "…" (id: …)` som F2-follow-up
(`handleSelectCatalogDossier` → `buildAddDossierMessage`). Konsekvenser:

1. Sajten byggs om **innan** användaren kan ange nyckel — env-fälten finns
   bara under Inkopplade, som får raden först efter rundan.
2. **Placeringen bestäms blint.** Dossierns instruktioner säger t.ex.
   «Place `<ChatPanel />` somewhere in the page tree — a sidebar, a modal, a
   dedicated `/chat` route» — LLM:n väljer fritt. Inget användarval, inget
   deterministiskt kontrakt (jfr inloggning: första sidan? egen `/login`-sida?).
3. En felklickning kostar en hel generationsrunda.

## Uppgift

- Klick i katalogen **stage:ar** valet i stället för att skicka: blocket visas
  som «valt, ej tillagt» med (a) blockets **stagingfrågor** (0–2 st, alltid med
  default, aldrig blockerande — se tabellen), (b) nyckelfält direkt,
  (c) **EN** åtgärd («Lägg till i sajten») som skickar den sammansatta
  requesten.
- Alla block är inte visuella — frågetypen följer blocktypen:

| Blocktyp | Stagingfråga | Exempel |
|---|---|---|
| Synlig yta | **Placering** — var? | AI-chatt: flytande widget / egen sida / sektion. Auth: egen inloggningssida + var kontoindikatorn bor. Kontaktformulär: vilken sida/sektion |
| Data/innehåll | **Innehåll** — vad? | Databas: vad ska sparas (bokningar, ordrar …). CMS: vilka innehållstyper |
| Osynlig | **Ingen fråga** — bara bekräfta | Analytics: läggs till direkt |

- Dossier-filer är scaffold-neutrala (fasta paths via `mapDossierPathToOutput`:
  `components/`, `app/api/`, rot-configs, `lib/`) och skapar aldrig egna sidor.
  Placeringsfrågan är alltså ett *monterings*-val inom befintlig ruttplan —
  inte en ruttändring. Valet «egen sida» går genom ruttplanen som vanligt
  (dossiers får aldrig bli en andra ruttauktoritet, se dossier-kontraktet).
- Svaren följer med i prompten som strukturerade rader (och tas senare över av
  M1:s operation). Follow-ups ska bevara placeringen via snapshoten.
- Rimlig default per fråga så att «bara klicka vidare» fortfarande funkar.

## Beslutspunkter för ägaren vid implementation

- Klassning av alla 18 block i tabellens tre typer + exakta stagingfrågor för
  starttrion (ai-chat, auth, contact-form) — övriga får default.
- Om flera stage:ade block ska kunna skickas i samma runda.

## Vad som INTE ingår

- Inget nytt schema innan det är kontrollerat om briefen/BuildSpec redan bär
  motsvarande fält (GPT-materialets §3D-varning).
- Soft-dossiers ska inte få extra friktion — utan nycklar/placering att välja
  ska ett klick + bekräfta räcka.

## Verifiering

- UI-tester: stage → placering → nyckel → en request; avbryt utan kostnad.
- Golden prompt-test: placeringsraden når Dynamic Context.
- `npm run typecheck` + riktad vitest.

## Klart när

Ingen generering startar förrän användaren bekräftat; placeringen är ett val
med default, inte en gissning.
