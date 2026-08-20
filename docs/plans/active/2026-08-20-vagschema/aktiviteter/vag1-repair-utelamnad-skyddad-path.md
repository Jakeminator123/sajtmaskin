# Våg 1 — Full-project repair kan spara bort en skyddad fil som modellen utelämnar

Backlograd: `SM-066`
Beror på: inget. Blockerar: inget.
Ägda filer: `src/lib/gen/scaffolds/protected-paths.ts`,
`src/lib/gen/verify/server-verify/repair-execution.ts`, `verify-run.ts`,
`src/app/api/engine/chats/[chatId]/repair/route.ts` + tester.

## Det verifierade fyndet

`#1066` (`SM-034`) stängde ett verkligt hål: när fallback-reinjecten lämnar en
skyddad path i `stillMissing` blockeras persist, och blocket är terminalt för
hela körningen. Den fixen är korrekt.

Den täcker bara paths som modellen **nämnde och droppade**. Utelämnar modellen
pathen helt blir `droppedPaths` tom, och då är reinjecten en no-op:

```
src/lib/gen/scaffolds/protected-paths.ts:101-103
  if (droppedPaths.length === 0) {
    return { files: kept, reinjected: [], stillMissing: [] };
  }
```

Persist-vägen partitionerar bara det som finns i modellens output, reinjectar
bara det som partitionen såg som droppat, och sparar sedan hela listan
(`repair-execution.ts:225-230` → `328-340`). Samma mönster i
`repair/route.ts:401-409` och `verify-run.ts:459-466`.

Ingen loop går över `SCAFFOLD_PROTECTED_PATHS` (`app/icon.svg`,
`app/api/placeholder/route.ts`) vid persist för att kräva att de **är** där.
Koden medger själv luckan i kommentaren på `repair-execution.ts:209-213`.

Varför just full-project: de andra vägarna har redan skydd. Partial-file-repair
mergar mot scaffold/previous (`preflight-phase.ts:349-377`,
`finalize-merge.ts:382-385`) och den riktade repair-loopen behåller filer fixern
inte nämner (`repair-loop.ts:445-450`). Men
`buildTargetedRepairBundle` returnerar `null` när urvalet täcker hela projektet
(`repair-loop.ts:432`), och då används modellens `fixedContent` rakt av.

Testerna täcker bara emit-och-droppa (`protected-paths.test.ts:145-154`,
`server-verify.still-missing-protected.test.ts:146-148`) plus den explicita
no-op:en när inget droppats (`protected-paths.test.ts:157-169`).
Repair-routens test **mockar** `stillMissing` och tvingar `dropped: []`
(`route.test.ts:110-122`) — alltså exakt det fall som inte skyddas.

## Uppgiften

Gör närvaron av skyddade paths till ett krav vid persist i full-project-vägen,
inte en konsekvens av att någon råkade dropppa dem.

1. Låt reinjecten (eller en tunn syskonfunktion i samma fil) kunna svara på
   frågan «finns varje skyddad path i den slutliga listan?» oavsett vad
   partitionen såg. Saknas en och fallback har den: återinsätt. Saknas en och
   fallback saknar den också: samma terminala block som `#1066` inför.
2. Använd den i alla tre persist-punkterna — `repair-execution.ts`,
   `repair/route.ts` och `verify-run.ts`. Lämna ingen av dem osynkroniserad.

## Gränser

- Ändra inte listan `SCAFFOLD_PROTECTED_PATHS`.
- Rör inte partial-file- eller targeted-vägen. De har redan sitt skydd, och
  dubbla skydd i samma pass gör diffen ogranskningsbar.
- Inför ingen ny LLM-runda och ingen ny repair-agent.
- Blocket ska bete sig som `#1066`:s: terminalt för körningen, inte en tyst
  retry-loop.

## Klart när

- Ett test som ger repair-output **utan** en skyddad path (inte droppad — aldrig
  nämnd) och kräver att persist antingen återinsätter filen ur fallback eller
  blockeras terminalt.
- Samma invariant bevisad för minst en av de tre persist-punkterna utöver den du
  utgår från, så vägarna inte kan glida isär.
- Befintliga `stillMissing`-tester fortfarande gröna.
- `npm run typecheck` + `npx vitest run src/lib/gen/verify src/lib/gen/scaffolds` gröna.

## Agentprompt

> Du är Builder i Sajtmaskin. Utgå från origin/master. Läs
> `docs/plans/active/2026-08-20-vagschema/00-master-plan.md` (agentkontraktet)
> och sedan den här filen.
>
> Uppgift: `#1066` blockerar persist när fallback-reinjecten lämnar en skyddad
> path i `stillMissing`, men bara när modellen nämnde och droppade pathen. En
> modell som utelämnar `app/icon.svg` eller `app/api/placeholder/route.ts` helt
> ger tom `droppedPaths`, och då sparas projektet utan filen. Gör närvaron till
> ett krav vid persist i full-project-vägen och tillämpa det i alla tre
> persist-punkterna.
>
> Rör inte listan av skyddade paths, partial-file-vägen eller den targeted
> repair-loopen. Ingen ny LLM-runda.
>
> Verifiering: `npm run typecheck`,
> `npx vitest run src/lib/gen/verify src/lib/gen/scaffolds`.
> I en worktree med länkad `node_modules`: lägg till
> `--pool=threads --no-file-parallelism`.
>
> EN PR mot master, inte draft. Bugbot-pass på egen diff, sign-off-kommentar
> innan `merge:ready`. Du mergar inte. Rör inte `BUG-SWARM-BACKLOG.md`.
