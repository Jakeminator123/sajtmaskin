# En chatt: Sajtagenten flyttar in i builderns chatt

> **Status: E1–E8 implementerade lokalt på `preview` (2026-10-22), ej pushade.**
> Typecheck, lint och riktade tester gröna. `agent_messages`-migrationen är
> **applicerad på både DEV och PROD** (ägarmandat 2026-10-22: DEV via
> `db:ensure` över session-URL:en, PROD via `db:migrate:prod` med reason;
> `db:schema-parity --require` grön efteråt, 53 tabeller identiska). Klienten
> är fail-soft om tabellen saknas.
> Ägarbeslut: fria tyglar direkt efter promote till `master`; säkerhet
> prioriteras inte i detta skede och Sajtagenten (OpenClaw) ska ha höga
> befogenheter i buildern. Underlag: ägarens ChatGPT-granskning av repot
> (2026-10-22) och kodläsning på `6da0a0d66`.

## Ursprung

Buildern har i dag två samtal: builderchatten till vänster (byggmotorn:
generering, versioner, preview) och Sajtagenten/OpenClaw som flytande bubbla
till höger (`OpenClawChat` i root-layouten). De är kopplade via DOM:
Sajtagenten fyller `data-openclaw-text-target="builder.chat.primary"` och
klickar den riktiga send-knappen när ett mandat är armerat. Det fungerar, men
användaren måste förstå var man frågar, var man bygger och hur ett förslag
flyttas emellan. Interna väckningar (`[Automatisk fortsättning]`,
`[Automatisk väckning]`) går dessutom genom samma `send` som användartext och
renderas som användarbubblor.

## Målbild

```
Användaren skriver i EN input i builderchatten
        │
        ▼
 Typ av uppgift (auto / fråga / bygg)
   ├── fråga eller granska ──► Sajtagenten (OpenClaw) ──┐
   │                                                   │ ändringsuppdrag
   └── skapa eller ändra ──────► Befintlig byggmotor ◄──┘
                                       │
                                       ▼
                          Kontroller och ny version
                                       │
                                       ▼
                  Gemensam historik i samma chatt (bygg + agent)
                                       │
                                       ▼
               Sajtagenten läser resultatet och föreslår nästa steg
```

Sajtagenten blir samtalspartnern; byggmotorn fortsätter bygga. Samma chatt,
samma historik, en input.

## Bevisat i koden (inte antaget)

- Builderns komposer: `ChatInterface.tsx` äger inputen och skickar via
  `onSendMessage`/`onCreateChat`; prepared-fill-taggen sätts där.
- Sajtagentens panel: `OpenClawChatPanel.tsx` + `useOpenClawChat.ts`
  (fetch mot `/api/openclaw/chat`, Zustand-store `openclaw-store.ts`).
  Historiken är sessionsbunden i minnet och töms vid scope-byte.
- Åtgärder: `text-field-actions.ts` parsar ett action-block per svar
  (`fill_text_field`, `request_repair`, `start_bug_hunt`, `apply_quick_edit`);
  korten i `OpenClawMessage.tsx` utför dem. Armerad auto-send klickar DOM-knappen
  och `useOpenClawArmedContinuation` väcker agenten när builderturen är terminal.
- Befogenheter: `powers.ts` (AND av `OC_EDIT`, sköldknapp och vald befogenhet),
  persisterade per chatt i `live_review_grants`.
- Kontext: `use-dev-context-effects.ts` publicerar `window.__SITEMASKIN_CONTEXT`
  (fem senaste meddelanden, kod, version, status); servern kompletterar med
  ägarverifierad filkontext och fynd (`server-context.ts`, `chat/route.ts`).
- `engine_messages` läses av byggmotorn (`buildBoundedChatHistory`,
  F3-continuation, live-review). Agentturer får därför **inte** lagras där.
- Tips efter bygge: `use-f3-tips-chrome.ts` → `/api/openclaw/tips` → `TipCard`.

## Ramar

- OpenClaw skriver aldrig filer själv; alla ändringar går genom builderns
  ordinarie pipeline (beslut 2026-08-14). Snabbändring kräver manuellt
  godkännande per förslag.
- Byggmotorns LLM-historik (`engine_messages`) förblir ren: agentens samtal
  lagras separat.
- Inga nya OpenClaw-verktyg på Render (browser/shell/internet).
- Ingen DB-apply i detta uppdrag: migrationen skrivs och ledgerförs i
  `migration-order.mjs`, men appliceras på eget mandat. Klienten är fail-soft
  tills tabellen finns.

## Etapper

| Etapp | Leverans | Ägarfiler |
|---|---|---|
| E1 Agentens hem | `SajtagentProvider` i buildern äger `useOpenClawChat`, continuation, health-flaggor och powers-hydrering. Den flytande bubblan renderas inte på `/builder`. | `src/components/builder/chat/sajtagent/SajtagentProvider.tsx`, `OpenClawChat.tsx` |
| E2 En input | Lägesväljare Auto · Fråga · Bygg i komposern. `resolveComposerRoute` väljer agent eller byggmotor deterministiskt; bilagor, Figma, inspect-punkter och ny chatt går alltid till byggmotorn. | `src/lib/builder/composer-route.ts`, `ChatInterface.tsx` |
| E3 En historik på skärmen | `MessageList` renderar agentens rader i samma tidslinje. Agentrader förankras vid builderns senaste meddelande (`anchorBuilderMessageId`). Interna väckningar visas som statusrad, aldrig som användarbubbla. `TipCard` försvinner. | `src/lib/openclaw/agent-message-kind.ts`, `src/lib/builder/unified-timeline.ts`, `MessageList.tsx`, `OpenClawMessage.tsx` |
| E4 Byggkommandon | `builder-bridge.ts`: buildern registrerar `sendMessage`/`cancel`; auto-send går via bryggan (DOM-klick kvar som fallback). Ny action `start_build` som startar en byggtur direkt när armerad autonomi är beviljad, annars ett godkännandekort. Befogenheter default-på i buildern när `OC_EDIT` är på och ingen grant finns. | `src/lib/openclaw/builder-bridge.ts`, `text-field-actions.ts`, `edit-system-prompt.ts`, `OpenClawMessage.tsx`, `powers/route.ts`, `persist-openclaw-powers.ts` |
| E5 Beständig historik | Tabell `agent_messages` (chat_id FK, role, kind, content, meta, created_at) + `GET/POST /api/engine/chats/[chatId]/agent-messages` med ägarkontroll. Klienten hydrerar vid chattbyte och persisterar varje avslutad tur. | `schema.ts`, `migrations/add-agent-messages.sql`, `migration-order.mjs`, `db-health-check.mjs`, `db-init.mjs`, `services/agent-messages.ts`, `agent-history.ts` |
| E6 Efter bygget | När en builder-tur blir terminal väcks Sajtagenten en gång med `[Byggresultat]` och svarar kort med nästa bästa steg. Ersätter tips-popovern; styrs av samma inställning. | `src/lib/openclaw/post-build-digest.ts`, `SajtagentProvider.tsx`, `use-f3-tips-chrome.ts` |
| E7 Serverprompt | Systemprompten beskriver den gemensamma chatten, direktbygg och att byggmotorn är en separat process. | `src/app/api/openclaw/chat/route.ts`, `edit-system-prompt.ts` |

Ordning: E1 → E2 → E3 → E4 → E5 → E6 → E7. E5 kan landa utan DB-apply.

Mental modell för användare och agenter: [`docs/concepts/sajtagenten.md`](../../../concepts/sajtagenten.md).

### E8 Kodnavigering (tillagd 2026-10-22, samma dag)

Agenten fick ett riktigt arbetssätt för kod: manifestet skickas alltid för en
ägd chatt (`navigate` i `chat-context-policy.ts`), och actionen `read_files`
låter den be om upp till sex filer per runda (två rundor per fråga) som
klienten hämtar ägarverifierat och skickar tillbaka som intern
`[Filinnehåll]`-tur (`read-files.ts`, `navigation-system-prompt.ts`,
`SajtagentProvider`). Läsning kräver ingen befogenhet.

## Beteenderegler i den gemensamma chatten

- En fråga förblir en fråga: text som slutar med `?`, inleds med frågeord eller
  ber om granskning går till Sajtagenten.
- En uttrycklig instruktion («byt knapptexten till Boka tid», «lägg till en
  sida») går direkt till byggmotorn. Lägesväljaren kan tvinga båda.
- Sajtagenten får starta ett bygge (`start_build`) bara när användaren bett om
  en ändring och armerad autonomi är beviljad; annars visas ett kort att godkänna.
- Stopp: komposerns stoppknapp avbryter agenten; headerns «Avbryt» avbryter
  bygget och släpper ett aktivt mandat.
- Versionsbindning: snabbändringar binds fortsatt till versionen modellen såg.

## Ingår inte nu (följduppdrag)

- Budget/creditreservation per agentuppdrag (chat-routen debiteras inte i dag).
- Sajtägarens agent efter publicering (tillval) och projektminne.
- Avatar (D-ID) i den gemensamma chatten; avataren stannar i bubblan på
  landnings- och kampanjytor.
- Kampanjflödets rådgivningskvot visas bara som statusrad i buildern.

## Verifiering

- Rena moduler har egna tester: `composer-route`, `unified-timeline`,
  `agent-message-kind`, `builder-bridge`, `post-build-digest`,
  `agent-messages`-routen.
- Komponenttester: `ChatInterface` routar till agenten, `MessageList` renderar
  agentrader och statusrad, `OpenClawChat` renderar ingen bubbla på `/builder`.
- Lokalt: `npm run typecheck`, `npm run lint`, riktade `vitest run`-filer,
  `npm run verify:pr -- --plan`.

## Risker

- Felklassad avsikt skickar en byggprompt till agenten eller tvärtom. Mildras
  av lägesväljaren och att agenten kan starta bygget själv.
- Default-på befogenheter innebär att modellen kan starta byggen som kostar
  credits. Ägarbeslut 2026-10-22; sköldknappen stänger av per chatt.
- `agent_messages` saknas tills migrationen appliceras; klienten loggar tyst
  och fortsätter utan beständig historik.
