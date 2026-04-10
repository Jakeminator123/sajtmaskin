---
name: follow-up reality sync
overview: Förenkla follow-up-kedjan och höja kvaliteten genom att minska antalet beslutspunkter, göra systemet mer begripligt och låta docs spegla faktisk runtime. Inga nya överordnade begrepp.
todos:
  - id: consolidate-ambition-level
    content: Samla "hur stor är den här follow-upen?" till ett enda tidigt beslut i stället för fyra separata heuristiker
    status: pending
  - id: simplify-decision-surface
    content: Minska antalet ställen som avgör context budget, verification level och file-context storlek
    status: pending
  - id: improve-multiturn-memory
    content: Ge snapshot/continuity mer strukturerad information mellan turer så att turn 3-6 inte tappar projektets form
    status: pending
  - id: docs-reflect-reality
    content: Håll docs i synk med faktisk runtime utan att lägga på nya förklaringslager
    status: pending
isProject: false
---

# Follow-Up Reality Sync

## Vad som redan gjorts (commit `trassel`, 90d22ab8f)

Ändringarna var konservativa och lade inte till nya begrepp. Allt typecheck-rent, 61+ tester gröna.

### Bra ändringar som bör behållas
- **Capability-hints som eget block** i dynamisk kontext (var inbakat i scaffold; nu synligt separat)
- **`hasHeavyCapabilities(caps)`** — enda ny funktion (14 rader). Används i `BuildSpec` och file-context-beslutet för att hindra att karusell/3D/premium-visuals klassas som pyttesmå tweaks
- **`BuildSpec` tar emot capabilities som parameter** från `orchestrate.ts` i stället för att köra `inferCapabilities` internt — renare dataflöde, ingen dubbel körning
- **Follow-up-text** i systemprompten ändrad till "current project state" i stället för "initial generation" — bättre för turn 3–6
- **`stylePack`** och **`capabilityHints`** i continuity/snapshot — bär mer signal mellan turer
- **Docs synkade** i `builder-generation.md`, `llm-input-blocks.md`, `llm-signal-flow.md`, `orchestration-signal-contract.md`, `src/lib/gen/README.md`
- **Gamla `scaffoldAndCapability`** städat bort ur alla testfiler

### Saker som togs bort under förenklingspasset
Sex exporterade hjälpfunktioner som lades till och sedan togs bort igen i samma chatt:
`hasDemandingFollowUpCapabilities`, `summarizeCapabilities`, `extractSnapshotCapabilities`, `hasDemandingSnapshotCapabilities`, `DEMANDING_FOLLOW_UP_CAPABILITIES`, `CAPABILITY_LABELS`. Ersattes av den enda `hasHeavyCapabilities`.

## Vad som fortfarande behöver göras

### Problemet
"Hur stor är den här follow-upen?" bestäms idag av fyra separata ställen som inte pratar med varandra:

1. `classifyFollowUpIntent()` i `follow-up-clarification.ts` — regex-baserad intent (clear-refine / clear-redesign / ambiguous)
2. `looksDesignHeavyMessage()` i `promptOrchestration.ts` — räknar generiska design-markörer (>= 3 träffar)
3. `hasHeavyCapabilities()` i `capability-inference.ts` — specifika capability-flaggor (3D, karusell, charts etc.)
4. `inferChangeScope()` + `inferContextPolicy()` + `inferVerificationPolicy()` i `build-spec.ts` — heuristiker som bestämmer BuildSpec-fälten

Dessutom sätter `chat-message-stream-post.ts` ihop resultatet av 1–3 till en `useLightFollowUpContext`-boolean som styr file-context-storlek, men den boolean:en och BuildSpec-fälten bestäms oberoende av varandra.

### Princip för förenkling
En follow-up borde få en tydlig ambitionsnivå tidigt. Den nivån borde sedan styra allt nedströms: context budget, verification, file-context storlek och finalize-path. Inte fyra parallella bedömare.

### Konkret riktning
1. **Ett enda ambitionsbeslut före orkestrering.** Samla intent-klassificering, capability-signal och design-heavy-check till en funktion som returnerar en tydlig nivå. Den nivån matar sedan `BuildSpec`.
2. **`BuildSpec` tar hela ansvaret nedströms.** `chat-message-stream-post.ts` borde kunna använda `buildSpec.contextPolicy` för att avgöra file-context-storlek i stället för att bygga sin egen parallella logik.
3. **Snapshot bär ambitionsnivå.** I stället för lösa fält borde snapshoten bära den nivå som senast gällde, så att turn 3–6 inte behöver gissa.
4. **Färre publika signaler.** `looksDesignHeavyMessage`, `hasHeavyCapabilities` och `classifyFollowUpIntent` borde gå mot att bli interna detaljer bakom det gemensamma beslutet, inte tre separata exporterade funktioner.

### Viktigaste filerna att förenkla
- `src/lib/api/engine/chats/chat-message-stream-post.ts` — file-context-beslutet (fem villkor idag)
- `src/lib/gen/build-spec.ts` — redan bättre efter detta pass men fortfarande parallellt med intent-klassificering
- `src/lib/providers/own-engine/follow-up-clarification.ts` — borde vara konsument av ambitionsnivå, inte parallell bedömare
- `src/lib/builder/promptOrchestration.ts` — `looksDesignHeavyMessage` borde inte behöva vara publik

### Temporal utmaning
File-context wrappas in i user-turnen **före** BuildSpec beräknas. Det gör det svårt att låta BuildSpec styra file-context-storlek direkt. Möjliga vägar:
- Beräkna en "pre-BuildSpec ambitionsnivå" tidigt som både file-context och BuildSpec sedan använder
- Eller flytta file-context-beslutet till efter orchestration base (kräver att user-turn-wrappning sker senare)

### Skyddskrav
- Init/freetext-flödet (80% av användningen) får inte bli långsammare eller mer komplext
- Befintliga tester ska fortsätta passera
- Docs ska synkas i samma pass som kodändringar
- Inga nya begrepp eller abstraktionslager
