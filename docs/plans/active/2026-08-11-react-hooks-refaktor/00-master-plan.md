# React hooks-refaktor (builder) — utan eslint-disable

**Status:** öppen skuld · **inte** produktbugg · **inte** användarsajter  
**Efter:** [#889](https://github.com/Jakeminator123/sajtmaskin/pull/889) (varningar tystade / deps fixade)  
**Backlog:** `BUG-SWARM-BACKLOG.md` → *Säkerhet, infra och teknisk skuld*

## Vad det är

`eslint-plugin-react-hooks@7` (React Compiler-regler) flaggar mönster i **Sajtmaskins
builder**. Reglerna är medvetet `warn` i `eslint.config.mjs` så de inte hårdblockar
lint/F3. #889 gjorde `npm run lint` rent genom:

- riktiga deps-fixar där det var billigt
- `useSyncExternalStore` för add-panel-flaggan
- riktade `eslint-disable` där reset/ref-sync är avsiktligt

Den här planen är **nästa steg**: ta bort disables genom att skriva om till
React-rekommenderade mönster (härled under render, `key`-remount, event-reset,
eller annan ägare) — utan att ändra synligt beteende.

## Inventering (scoped disables i `src/`)

### `set-state-in-effect` — nollställ / abort / loading

| Fil | Varför disable finns | Föredragen riktning |
|---|---|---|
| `PreviewPanel.tsx` | Abort placement vid chat/version-byte; nollställ inspect-meny/region; rensa registry vid kodvy | Render-time state adjust (props→state) eller flytta reset till event/key |
| `usePreviewIframe.ts` | Rensa/reset iframe-fel och loading när preview-identitet byts | Samma: identity-key eller adjust-during-render |
| `useBuilderVmPreview.ts` | Droppa stale session-meta vid versionsbyte | Idempotent reset utan effect om möjligt |
| `useBuilderState.ts` | Refresh defaults när scaffold-läge byts | Derive / key |
| `useDeploymentStatus.ts` | Reset UI vid ny deployment-stream | Reset i subscribe-callback / key |
| `PreviewPanelBrowseGallery.tsx` | Loading innan async fetch | Loading flag i fetch-start (event) |
| `avatar-integration-status.tsx` | Loading för bridge-health | Dito |
| `reasoning.tsx` | Controlled/uncontrolled open sync | Controlled-only eller sync under render |

### `refs` under render

| Fil | Varför disable finns | Föredragen riktning |
|---|---|---|
| `useBuilderActiveVersionInfo.ts` | Senaste ids till async deploy-callbacks | `useEffect` sync (om säkert) eller läs props i callback-stängning |
| `useBuilderPageController.ts` | Wire bootstrap-success utan effect-deps | Callback-ref / effect |
| `conversation.tsx` | Scroll-ankare jämför tidigare message-ids | Ombyggnad av live-anchor-algoritm utan ref-läsning i `useMemo` |
| `OpenClawChatPanel.tsx` | Ref-lika fält från `useDidAvatar` | API-omformning (större yta) |

## Acceptans

1. Inga `eslint-disable react-hooks/set-state-in-effect` / `react-hooks/refs` kvar i listan ovan (eller dokumenterat undantag med ägarbeslut).
2. `npm run lint` fortfarande 0 problems.
3. Riktade builder/preview-tester gröna; manuell smoke: inspect-meny, preview-byte, placement-abort, chat-scroll.

## Ordning (förslag)

1. **PreviewPanel + usePreviewIframe** (högst synlig yta, flest disables från #889).
2. Övriga builder-hooks (`useBuilderVmPreview`, `useBuilderState`, deploy-status).
3. `conversation.tsx` / OpenClaw (högre beteenderisk → egen PR).

## Icke-mål

- Höja reglerna till `error` (behåll `warn` tills refaktor + användarsajts-scaffold är stabila).
- Röra genererade användarsajters ESLint-config (`project-scaffold.ts`) i samma PR om det inte behövs.

## MVP-bias

Gör **inte** detta som snålskjuts i produkt-PR. Egna små PR:er, en yta i taget.
