# B2 — ett namn: Briefing

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Status: inte startad. **Namnfrågan är avgjord** (2026-08-20): lagret heter
Briefing — det står redan bindande i [`terminology.mdc`](../../../../../.cursor/rules/terminology.mdc)
och som kärnterm i glossaryn, så det som återstod var bara en hedgad namnskuggerad
som nu är rättad. Uppgiften nedan väntar därför på **prioritering**, inte på ett
beslut. Den är namngivning och produkttext, inte en defekt — kör den inte som
smygfix i en annan PR.

## Problemet

Samma sak har fyra namn, och ett av dem beskriver en funktion som togs bort
2026-04-21.

| Yta | Vad som står | Vad det är |
|---|---|---|
| `config/ai_models/manifest.json` | toppnycklarna `promptAssist` **och** `briefing` | två namn på samma lane; omdöpningen är halvgjord |
| `src/lib/hooks/useInitBrief.ts:72` | toast «Ogiltig förbättra-modell» | modellen som kör Deep Brief |
| `src/components/builder/shell/BuilderHeader.tsx:244` | «Assist aktiv» | brief-lanen är påslagen |
| `config/ai_models/20-prompt-assist.md` | filnamn + rubrik «Prompt assist» | dokumentation för brief-modellrutten |
| `docs/architecture/glossary.md` | `Prompt-assist` = knappen bredvid Plan (ägarbeslut 2026-08-19) | Deep Brief-rutten får inte heta Prompt-assist i produkttext |

«Prompt-assist» **pensioneras inte** — se [B10](B10-prompt-assist-knapp.md).
Ordet «förbättra» pekar på en knapp som är borta (2026-04-21) och får inte
återanvändas för Deep Brief. Kodnyckeln `promptAssist` mappas i text till
Deep Brief, inte till knappen.

## Färdig läsarlista (kartlagd 2026-08-20)

Manifest-sammanslagningen är **mekanisk och avgränsad** — åtta filer, inte
femtioåtta. Skillnaden är avgörande: `promptAssist` förekommer i 58 filer, men i
nästan alla som **kodidentifieraren** `promptAssistModel` / `promptAssistDeep`,
som ska stanna. Bara dessa läser manifest-*nyckeln*:

| Fil | Vad som ska ändras |
|---|---|
| `config/ai_models/manifest.json` | Flytta `promptAssist.defaults.assist`, `envKeys.assist` och hela `allowed` in i `briefing`. Slå ihop `notes`. Ta bort `promptAssist` |
| `config/ai_models/manifest.schema.json` | `promptAssist` ur `required` (rad ~9) och ur `properties` (~74). Lägg `assist` i `briefing.defaults`/`envKeys` och `allowed` i `briefing` |
| `src/lib/ai-models/load-manifest.ts` | `promptAssistSchema` (~63–78) in i `briefingSchema` (~80–92). `getPromptAssistAllowedFromManifest` (~427) läser `briefing.allowed`. **Behåll funktionsnamnet** |
| `src/lib/gen/defaults.ts` | `const pa = manifest.promptAssist` (~27) bort; `ASSIST_MODEL` (~54) läser briefing-fälten |
| `scripts/docs/contract-docs-core.mjs` | `assistRows` (~525) läser `manifest.briefing.defaults`. De två genererade tabellerna «Deep Brief» och «Briefing» blir en — **detta är den enda delen med formfrihet, och därför den som ska granskas noggrannast** |
| `src/lib/ai-models/manifest-parity.test.ts` | Nyckelvägarna på ~51, ~56 och ~228 |
| `backoffice/pages/ai_models.py` | `manifest.setdefault("promptAssist", …)` (~311–313) och skrivvägen (~350–359) |
| `backoffice/test_validate_manifest.py` | `del manifest["promptAssist"]["allowed"]…` (~82) → briefing-vägen |

Målform på `briefing`:

```json
"briefing": {
  "defaults": { "assist": "…", "requestModel": "…", "serverAutoOpenAI": "…", "serverAutoAnthropic": "…" },
  "envKeys":  { "assist": "SAJTMASKIN_ASSIST_MODEL", "requestModel": "SAJTMASKIN_BRIEF_MODEL", … },
  "allowed":  { "gatewayClassModels": […], "anthropicDirectModels": […], "models": […] }
}
```

`assist` och `requestModel` är **inte** dubbletter trots att båda är
`openai/gpt-5.6-sol` i dag: `assist` är klientens valbara Deep Brief-modell
(default för `promptAssistModel` i builder-state), `requestModel` är serverns
default för `/api/ai/brief` när anroparen inte skickar någon. Slå inte ihop dem.

Verifiering (allt måste vara grönt): `npm run typecheck` ·
`npx vitest run src/lib/ai-models src/lib/gen src/lib/builder` ·
`npm run backoffice:test` (unittest, **inte** pytest) · `npm run lint:py` ·
`npm run docs:generate` + `npm run docs:check` · `npm run docs:links`.

**Kör som PR, inte direktpush.** Manifestet Zod-parsas vid import, så ett
schemaglapp bryter varje generation — CI är sista nätet och ska hinna tala.

## Uppgift

Gör **Briefing** till det enda produktnamnet för lagret före kodgeneratorn, med
fyra lägen: Init Brief, Auto Brief, Ändringsbrief (LLM-delta vid
`clear-redesign`), Snapshot (återanvänd brief på vanliga uppföljningar).
Blanda inte ihop Ändringsbrief med Snapshot-Brief — se B6.

Krav:

- Slå samman manifestets `promptAssist` in i `briefing`. Behåll `envKeys` exakt
  som de är och lämna `promptAssist` kvar som alias bara om `manifest.schema.json`
  eller `manifest-parity.test.ts` kräver det — i så fall med en `notes`-rad som
  säger att det är legacy. **Not:** `SAJTMASKIN_ASSIST_MODEL` är **inte** satt i
  någon Vercel-miljö (CLI-verifierat 2026-08-20), så Deep Brief kör på
  manifest-defaulten. Variabeln är en valfri override (`optional_runtime` i
  `config/env-policy.json`), inte en driftsatt bindning — men den läses av
  `manifest-parity.test.ts:51` och `src/lib/builder/defaults.ts:139`, så ta inte
  bort namnet ur schemat utan att röra dem.
- Rör **inte** `SAJTMASKIN_PROMPT_REWRITE_MODEL` eller workload `prompt_rewrite`.
  De hör till knappen Prompt-assist (B10), inte till det här lagret. Att blanda
  ihop dem är den vanligaste feltolkningen av den här uppgiften.
- Byt användarsynlig text som syftar på Deep Brief: «Ogiltig förbättra-modell» →
  «Ogiltig brief-modell», «Assist aktiv» → «Brief aktiv». Rör inte knappen
  Prompt-assist (B10). Ingen ny badge för brief-lanen.
- Döp om `config/ai_models/20-prompt-assist.md` → `20-briefing.md` och uppdatera
  länkarna (`_READ_ME_FIRST.md`, `00-overview.md`, `docs/schemas/*`).
- Flytta **inte** `Prompt-assist` till namnskuggor. Glossaryn äger redan
  knappen (2026-08-19). Lägg in **Källpaket** som produktord för samlingen av
  valbara ingredienser (beslut N2), med noten att filnamnet
  `variant-template-addenda.json` behålls. Deep Brief-rutten mappas i
  namnskuggor, inte som Prompt-assist.
- Skriv in auktoritetsordningen (masterplanens tabell) i glossaryn eller
  `docs/schemas/llm-role-matrix.md` — en gång, en ägare.

## Vad som INTE ingår

- Byt **inte** namn på kodidentifierare, wire-fält eller DB-kolumner:
  `promptAssistModel`, `promptAssistDeep` (`src/lib/validations/chat-schemas.ts:33-34`),
  `prompt_assist_model`, `prompt_assist_deep`, `prompt_assist_mode`
  (`src/lib/db/schema.ts:222-224`). `terminology.mdc` säger mappa i text.
- Byt inte namn på mappen `src/lib/builder/prompt-assist/` i samma PR som B1 —
  två diffar i samma filer blir svåra att granska. Antingen efter B1, eller inte.
- Inför inte ordet «AI-assistent». Det betyder Sajtagenten/OpenClaw
  (`src/components/openclaw/OpenClawChatPanel.tsx:55`) och får inte bli tvetydigt.
- Ingen ny env-flagga, ingen ny modell, ingen beteendeändring.

## Verifiering

- `npm run typecheck` + `src/lib/ai-models/manifest-parity.test.ts`.
- `npm run docs:generate`, `npm run docs:check`, `npm run docs:links` — manifestet
  har genererade projektioner (`docs/generated/models.generated.md`).
- Backoffice: `backoffice/pages/ai_models.py` läser manifestet — kör
  `backoffice/test_validate_manifest.py`.
- Grep: `Förbättra-modell`, `förbättra-modell`, `Assist aktiv` ska ge noll träffar
  i användarsynliga strängar.

## Klart när

Ingen text som syftar på Deep Brief kallar den «Prompt-assist», «Assist Model»
eller «förbättra-modell». Knappen Prompt-assist (B10) får heta just det.
Env-nycklar, wire-fält och DB-kolumner med `promptAssist*` är oförändrade.
