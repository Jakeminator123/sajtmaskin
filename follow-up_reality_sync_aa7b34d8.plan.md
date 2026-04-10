---
name: follow-up reality sync
overview: Förenkla follow-up-kedjan och höja kvaliteten genom att minska antalet beslutspunkter, göra systemet mer begripligt och låta docs spegla faktisk runtime. Inga nya överordnade begrepp.
todos:
  - id: consolidate-ambition-level
    content: Samla "hur stor är den här follow-upen?" till ett enda tidigt beslut i stället för fyra separata heuristiker
    status: pending
  - id: improve-multiturn-memory
    content: Ge snapshot/continuity mer strukturerad information mellan turer så att turn 3-6 inte tappar projektets form
    status: pending
  - id: simplify-decision-surface
    content: Minska antalet ställen som avgör context budget, verification level och file-context storlek
    status: pending
  - id: docs-reflect-reality
    content: Håll docs i synk med faktisk runtime utan att lägga på nya förklaringslager
    status: pending
isProject: false
---

# Follow-Up Reality Sync

## Nuläge efter första passet

Första passet (denna chatt) gjorde:

1. **Statisk prompt:** slog ihop fragment, förtydligade export-regler, färgregler och lockfile-awareness. Konservativt och rimligt.
2. **Capability-signaler i follow-up:** lade till `hasDemandingFollowUpCapabilities` så att karusell/3D/premium-visuals inte fastnar i light/fast-spåret. Löser ett verkligt problem men lade till nya funktioner och kodstigar snarare än att förenkla.
3. **Capability-hints som eget block:** separerade från scaffold i dynamisk kontext. Förtydligar vad modellen ser men ändrade `OrchestrationBase`-interfacet.
4. **Snapshot-baserad kontinuitet:** capability-flaggor och `stylePack` följer med i continuity-blocket. Bra signal men ytterligare rörliga delar.
5. **Docs-sync:** synkade `builder-generation.md`, `llm-input-blocks.md`, `llm-signal-flow.md`, `orchestration-signal-contract.md` och `src/lib/gen/README.md` mot verkligheten.
6. **Tester:** 60 riktade tester passerar, typecheck rent.

### Vad som fortfarande saknas

Det övergripande problemet kvarstår: follow-up-kedjan har fortfarande flera separata beslutspunkter som inte pratar med varandra.

Idag bestäms "hur stor är den här follow-upen?" av:
- `classifyFollowUpIntent` i `follow-up-clarification.ts`
- `looksDesignHeavyMessage` i `promptOrchestration.ts`
- `hasDemandingFollowUpCapabilities` (nytt från detta pass)
- `hasDemandingSnapshotCapabilities` (nytt från detta pass)
- `inferChangeScope` + `inferContextPolicy` + `inferVerificationPolicy` i `build-spec.ts`
- `useLightFollowUpContext` i `chat-message-stream-post.ts`

Det här är sex olika ställen som alla bidrar till samma fråga. Varje tillägg av en ny signal (som vi just gjorde) gör det svårare att förstå helheten.

## Verklig förenkling (nästa pass)

### Princip
En follow-up borde få en tydlig **ambitionsnivå** tidigt, och sedan borde den nivån styra allt: context budget, verification, file-context storlek och finalize-path. Inte fyra separata heuristiker som var och en gör sin bedömning.

### Konkret riktning
1. **Ett enda ambitionsbeslut före orkestrering.** Samla intent-klassificering, capability-signal, design-heavy-check och snapshot-signaler till en funktion som returnerar en tydlig nivå (t.ex. "minor-edit", "visual-upgrade", "structural-change", "redesign"). Denna nivå matar sedan `BuildSpec`.
2. **`BuildSpec` tar hela ansvaret.** Alla nedströms beslut (context budget, verification, file-context, finalize-path) borde utgå från `BuildSpec`-fälten, inte från parallella heuristiker i `chat-message-stream-post.ts`.
3. **Snapshot bär strukturerad ambitionsnivå.** I stället för lösa fält som `modelTier` och `scaffoldId` borde snapshoten bära den nivå som senast gällde, plus capabilities, så att turn 3-6 inte behöver gissa.
4. **Minska, inte öka, antalet exporterade hjälpfunktioner.** `looksDesignHeavyMessage`, `hasDemandingFollowUpCapabilities`, `hasDemandingSnapshotCapabilities` och `classifyFollowUpIntent` borde gå mot att bli interna detaljer bakom ett gemensamt beslut, inte fyra publika signaler som alla konsumenter måste orkestrera själva.

### Filer att förenkla
- `src/lib/api/engine/chats/chat-message-stream-post.ts` — ska inte behöva fem villkor för att välja file-context-storlek
- `src/lib/gen/build-spec.ts` — borde ta emot capability-signaler som input i stället för att köra `inferCapabilities` internt
- `src/lib/providers/own-engine/follow-up-clarification.ts` — borde vara en konsument av ambitionsnivå, inte en parallell bedömare
- `src/lib/builder/promptOrchestration.ts` — `looksDesignHeavyMessage` borde vara en intern detalj, inte en publik export

### Skyddskrav
- Init/freetext-flödet ska inte bli långsammare eller mer komplext
- Befintliga tester ska fortsätta passera
- Docs ska synkas i samma pass som kodändringar
