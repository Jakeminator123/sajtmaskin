# Builder-labbet (`/builder-lab`)

Fristående koncept för builderns UI/UX. All data är påhittad och körs i
webbläsaren: inga API-anrop, ingen databas, ingen byggmotor. Sidan svarar 404
när `VERCEL_ENV=production`. Den riktiga buildern (`/builder`) är orörd.

| Fil | Ansvar |
|---|---|
| `_lib/engine.ts` | **Sömmen**: kontraktet `StudioEngine` som UI:t behöver från en motor, med var varje fält finns i `BuilderViewModel` |
| `_lib/use-studio.ts` | Påhittad motor + UI-läge; `engine` kontrolleras mot kontraktet med `satisfies` |
| `_lib/mock-data.ts` | Påhittade sajter, paletter, byggsteg och uppföljningslogik |
| `_components/builder-lab.tsx` | Skalet: layoutlägen (panel/kub/fokus), kortkommandon, dialoger |
| `_components/top-bar.tsx` | Toppraden (tre zoner) och statusfältet med avbryt |
| `_components/chat-dock.tsx` | Chatten, byggkortet och komposern (med kö) |
| `_components/canvas.tsx` | Förhandsvisningen: enheter, peka & ändra, jämför, versionssvep |
| `_components/build-cube.tsx` | Byggkuben (sex sidor, svep, solfjäder) |
| `_components/agent-call.tsx` | Videosamtal med Sajtagenten (bild-i-bild) |
| `_components/lab-logo.tsx` | Raketloggan som boostar under bygget |

## Byta ut den gamla buildern

Inget i backend behöver ändras: allt UI:t behöver finns redan i
`useBuilderPageController()`. Bytet görs stegvis bakom en flagga, så den gamla
buildern finns kvar tills den nya är bevisad.

1. **Adapter.** `useLiveStudio(vm)` som ger `StudioEngine` från
   `BuilderViewModel` (tabellen nedan). Kön för ändringar under bygge bor i
   adaptern, eftersom motorn själv inte köar.
2. **Skalet först.** `/builder?ui=studio` renderar labbets skal (toppraden,
   layoutlägen, kub, ⌘K, statusfält) med adaptern, men med de befintliga
   panelerna i canvasen: `PreviewPanel`, `MessageList`, `VersionHistory` och
   `BuilderShellDialogs`. Då följer alla flöden med från dag ett (F3,
   planer, frågor, publicering, domäner).
3. **Byt paneler en i taget.** Chatten och byggkortet först (mest synligt),
   sedan versionstidslinjen, sist förhandsvisningen (peka & ändra går via
   befintlig inspektionsbrygga i `PreviewPanel`).
4. **Vänd flaggan.** När `?ui=studio` klarar samma e2e-flöden blir den default;
   den gamla vägen tas bort i en separat PR.

| `StudioEngine` | Finns i dag |
|---|---|
| `projectName` | `vm.appProjectName` |
| `messages` | `vm.messages` (AI SDK-meddelanden; adaptern plockar text och byggstatus) |
| `versions` | `vm.effectiveVersionsList` |
| `activeVersionId` / `latestVersionId` | `vm.activeVersionId` / `vm.latestVersionId` |
| `build` | `vm.isAnyStreaming` + `getActiveAgentLogLabel` (`chat/tooling/agent-log.tsx`) |
| `submit` | `vm.requestCreateChat` (första prompten), sedan `vm.sendMessage` |
| `cancel` | `vm.cancelActiveGeneration` + `revokeOpenClawBuildConsent` (som skalet gör) |
| `selectVersion` | `vm.handleVersionSelect` |
| `reset` | `vm.resetToNewChat` |

Övrigt som UI:t visar och var det finns: förhandsvisning `vm.currentPreviewUrl`
och `PreviewPanel`; publicering `vm.handleOpenDeployDialog` och
`BuilderShellDialogs`; palett `vm.designTheme` / `vm.handlePaletteSelection`;
avatar `components/avatar/did-avatar-embed.tsx`.

## Bara i labbet (kräver motorstöd för att bli riktigt)

- **Sektioner som ritas och fylls i:** motorn strömmar filer, inte sektioner.
  Ersätts av byggfaserna tills motorn rapporterar sektioner.
- **Ändrade sektioner per version:** kräver att versionen sparar vilka
  sektioner som ändrades.
- **Jämför-reglaget:** två förhandsvisningar (två iframes) av olika versioner.
- **Videosamtalets avatar:** labbet visar en animerad orb; riktigt används D-ID.
