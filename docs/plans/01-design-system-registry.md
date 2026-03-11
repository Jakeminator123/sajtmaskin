# Plan 1: Design System via Registry

## Mål
Ge v0 ett eget Sajtmaskin design system så alla genererade sajter automatiskt
får konsistent design (färger, typsnitt, spacing, komponentstil) utan extra prompt-text.

## Status / positionering
- Detta är ett separat v0-spår för externa registry-baserade design systems.
- Det är **inte** samma sak som Sajtmaskins interna `designTheme`/tema-preset i den egna motorn.
- Egen motor förbättras först via prompt, brief, palette och visuella referenser; registry-spåret är fas 2.

## Bakgrund
- v0 stödjer `designSystemId` i `createChat` – se `src/lib/v0/v0-generator.ts` rad 416, 532-535.
- Koden har redan en TODO-cast: `(createRequest as V0SdkCreateRequest & { designSystemId?: string })`
- Registry-specen = en publik URL med `tokens.css` + `layout.tsx` + komponenter.
- v0 läser från registryt vid generation – vi äger registryt, inte v0.

## Steg

### S1. Skapa config-stöd för designSystemId
**Fil:** `src/lib/config.ts`
- Lägg till `DESIGN_SYSTEM_ID` i env-config (under `FEATURES` eller `AI`).
- Default: `undefined` (disabled).

### S2. Koppla designSystemId i generateCode
**Fil:** `src/lib/v0/v0-generator.ts`
- `GenerateCodeOptions` har redan `designSystemId?: string` (rad 416).
- I `generateCode()` (rad 532-535) skickas det redan med om det finns.
- Verifiera att typen är korrekt för v0 SDK:s `chats.create()`.
- Gör samma sak i `initFromRegistry()` (rad 851-938) – skicka med `designSystemId`
  om det finns i options.

### S3. Koppla designSystemId i stream-routes
**Filer:**
- `src/app/api/v0/chats/stream/route.ts` (ny chat)
- `src/app/api/v0/chats/[chatId]/stream/route.ts` (meddelande i befintlig chat)
- `src/app/api/v0/chats/route.ts` (skapa chat)

Läs `DESIGN_SYSTEM_ID` från config och skicka med till `generateCode()` / `createChat()`.
Om klienten skickar `designSystemId` i request body, använd det istället (override).

### S4. UI: Tema-väljare i BuilderHeader
**Fil:** `src/components/builder/BuilderHeader.tsx` (474 rader)

Lägg till en "Design tema"-dropdown bredvid model-väljaren:
- Alternativ: "Standard (Sajtmaskin)", "Minimalistisk", "Företag", "Kreativ"
- Varje alternativ mappar till ett `designSystemId` (eller `undefined` för default).
- Spara valt tema i builder-state och skicka med i stream-requests.

Håll det enkelt – hardcoded mappning till start, kan göras dynamisk senare.

### S5. Propagera theme state genom builder
**Filer:**
- `src/components/builder/ChatInterface.tsx` – ta emot `designSystemId` prop
- Builder-sidans state management – lägg till `designSystemId` i state

`ChatInterface` skickar med `designSystemId` i `onCreateChat` och `onSendMessage` payload.

### S6. Förbered för framtida registry-deploy
Skapa en `REGISTRY.md` doc i `docs/plans/` som beskriver hur man:
1. Klonar registry-starter
2. Anpassar tokens.css
3. Deployar till Vercel
4. Hämtar designSystemId
5. Konfigurerar env-var

Detta är ett separat steg som inte blockerar koden ovan.

## Filer som ändras
| Fil | Ändring |
|-----|---------|
| `src/lib/config.ts` | Ny env-var DESIGN_SYSTEM_ID |
| `src/lib/v0/v0-generator.ts` | Verifiera + utöka designSystemId-stöd |
| `src/app/api/v0/chats/stream/route.ts` | Läs config + skicka designSystemId |
| `src/app/api/v0/chats/[chatId]/stream/route.ts` | Samma |
| `src/app/api/v0/chats/route.ts` | Samma |
| `src/components/builder/BuilderHeader.tsx` | Tema-dropdown UI |
| `src/components/builder/ChatInterface.tsx` | Propagera designSystemId |

## Acceptanskriterier
- [ ] `DESIGN_SYSTEM_ID` env-var läses korrekt
- [ ] generateCode/initFromRegistry skickar designSystemId till v0 SDK
- [ ] Stream-routes propagerar designSystemId
- [ ] BuilderHeader visar tema-dropdown
- [ ] Valt tema skickas med i chat-requests
- [ ] Bygger utan TypeScript-fel
