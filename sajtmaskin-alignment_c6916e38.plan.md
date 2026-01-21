---
name: Sajtmaskin-alignment
overview: Målet är att konsolidera UI‑alternativen ("Landningssida"/"Webbapp"/"E‑handel") till en tydlig ingång, samt justera AI_GATEWAY + externa modeller till env‑styrning som i sajtgen, utan att ändra referensprojektet.
todos:
  - id: map-ui-options
    content: Kartlägg UI‑val → prompt → category‑mapping
    status: in_progress
  - id: consolidate-entry
    content: Konsolidera valen till wizard‑flöde, ta bort presets
    status: pending
  - id: gateway-env-only
    content: Bygg om AI_GATEWAY till env‑styrt, rensa DB/UI
    status: pending
  - id: align-preprompt-models
    content: Justera preprompting och modell‑normalisering
    status: pending
  - id: cleanup-verify
    content: Ta bort död logik och verifiera flöden
    status: pending
isProject: false
---

# Plan för alignment

## Målbild

- Konsolidera valen i buildern så att allt går genom en huvudväg (wizard) och mappar konsekvent till kategori‑prompts.
- Göra AI_GATEWAY env‑styrt (som i sajtgen) och ta bort per‑user gateway‑inställningar och relaterad död logik.
- Säkerställa att preprompting och modellval fungerar konsekvent för externa modeller.

## Viktiga filer att utgå från

- UI‑alternativ/presets: [src/components/builder/ChatInterface.tsx](src/components/builder/ChatInterface.tsx)
- Wizard/alternativ: [src/components/modals/prompt-wizard-modal-v2.tsx](src/components/modals/prompt-wizard-modal-v2.tsx)
- Kategori‑prompts: [src/lib/v0/v0-generator.ts](src/lib/v0/v0-generator.ts)
- Preprompt‑logik: [src/lib/builder/promptAssist.ts](src/lib/builder/promptAssist.ts), [src/lib/hooks/usePromptAssist.ts](src/lib/hooks/usePromptAssist.ts)
- AI Gateway + providers: [src/app/api/ai/chat/route.ts](src/app/api/ai/chat/route.ts), [src/app/api/ai/brief/route.ts](src/app/api/ai/brief/route.ts)
- User‑settings + DB‑fält: [src/components/settings/user-settings-modal.tsx](src/components/settings/user-settings-modal.tsx), [src/lib/data/database.ts](src/lib/data/database.ts)
- System prompt: [src/lib/v0/systemPrompt.ts](src/lib/v0/systemPrompt.ts)

## Referens (read‑only)

- Använd sajtgen som jämförelse, utan att ändra något där.

## Genomförande (hög nivå)

1. **Kartläggning och konsolidering av alternativ**
  - Spåra exakt flöde från UI‑val → prompt → `CATEGORY_PROMPTS`.
  - Bestäm vilka val som ska visas i wizard och hur de mappar till `landing-page`, `dashboard`, `ecommerce`, osv.
  - Ta bort/ersätt redundanta presets i `ChatInterface.tsx` så allt går via wizard‑flödet.
2. **Env‑styrt AI_GATEWAY**
  - Bygg om så `AI_GATEWAY_API_KEY` är enda källa (som sajtgen).
  - Rensa UI och DB‑fält för per‑user gateway (ta bort `use_ai_gateway`, `ai_gateway_api_key` och tillhörande logik).
  - Uppdatera `usePromptAssist` och `/api/ai/chat` så provider‑val styrs av env‑läge.
3. **Extern modell‑/preprompt‑konsistens**
  - Säkerställ att modellnamn följer `provider/model` och normaliseras likt sajtgen.
  - Verifiera att preprompt‑kedjan (normal/deep) alltid används innan v0‑anrop, och att `SYSTEM_PROMPT` används konsekvent.
  - Samordna fallback‑modeller och temperature‑logik mellan gateway och direkta providers.
4. **Städa död logik och verifiera**
  - Ta bort överflödiga komponenter, helpers och DB‑fält som inte längre används.
  - Validera manuellt: wizard‑val, prompt‑assist, externa modeller via gateway, och att generering fungerar end‑to‑end.

## Testplan

- Manuellt: välj varje kategori i wizard och verifiera prompt → generering.
- Manuellt: testa AI‑assist (normal + deep) med gateway, samt med en extern modell.
- Kontrollera felhantering/loggning för gateway när API‑nyckel saknas.

