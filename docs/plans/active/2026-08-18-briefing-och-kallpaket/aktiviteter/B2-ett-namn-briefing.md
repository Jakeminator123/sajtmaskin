# B2 — ett namn: Briefing

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)
Kräver ägarbeslut **N1**.

## Problemet

Samma sak har fyra namn, och ett av dem beskriver en funktion som togs bort
2026-04-21.

| Yta | Vad som står | Vad det är |
|---|---|---|
| `config/ai_models/manifest.json` | toppnycklarna `promptAssist` **och** `briefing` | två namn på samma lane; omdöpningen är halvgjord |
| `src/lib/hooks/useInitBrief.ts:72` | toast «Ogiltig förbättra-modell» | modellen som kör Deep Brief |
| `src/components/builder/shell/BuilderHeader.tsx:244` | «Assist aktiv» | brief-lanen är påslagen |
| `config/ai_models/20-prompt-assist.md` | filnamn + rubrik «Prompt assist» | dokumentation för brief-modellrutten |
| `docs/architecture/glossary.md:33, 212` | «Prompt-assist … Inte en agent» | en förklaring som bara behövs så länge namnet finns |

Ordet «assist» antyder en agent som förbättrar användarens prompt. Det finns
ingen sådan. Ordet «förbättra» pekar på en knapp som är borta. Båda kostar
läsförståelse varje gång någon nyanställd, granskare eller agent läser koden.

## Uppgift

Gör **Briefing** till det enda produktnamnet för lagret före kodgeneratorn, med
fyra lägen: Init Brief, Auto Brief, Ändringsbrief, Snapshot.

Krav:

- Slå samman manifestets `promptAssist` in i `briefing`. Behåll `envKeys` exakt
  som de är (`SAJTMASKIN_ASSIST_MODEL` m.fl. är driftsatta) och lämna
  `promptAssist` kvar som alias bara om `manifest.schema.json` eller
  `manifest-parity.test.ts` kräver det — i så fall med en `notes`-rad som säger
  att det är legacy.
- Byt användarsynlig text: «Ogiltig förbättra-modell» → «Ogiltig brief-modell»,
  «Assist aktiv» → «Brief aktiv». Ingen ny yta, ingen ny badge.
- Döp om `config/ai_models/20-prompt-assist.md` → `20-briefing.md` och uppdatera
  länkarna (`_READ_ME_FIRST.md`, `00-overview.md`, `docs/schemas/*`).
- Uppdatera glossaryn: `Prompt-assist` flyttas från kärntermer till
  namnskuggor/legacy med pekare till `Briefing`. Lägg in **Källpaket** som
  produktord för samlingen av valbara ingredienser (beslut N2), med noten att
  filnamnet `variant-template-addenda.json` behålls.
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

Ingen text som en användare, ägare eller agent läser innehåller «Prompt-assist»,
«Assist Model» eller «förbättra-modell» som en levande sak, samtidigt som varje
env-nyckel, wire-fält och DB-kolumn är oförändrad.
