# T6 — `fix-failed` på ett rådgivande fynd får inte färga hela Slutsteg rött

Styrdokument: [`../00-master-plan.md`](../00-master-plan.md)

## Problemet

I körning `6e865848-8df5-46e9-aa81-c52ce7221d07` (2026-08-14) byggdes sajten klart,
sparades, promotades och renderade. Ändå stod rubriken i chatten:

```text
Slutsteg (62) · fel
```

Orsaken är en enda rad i stegkedjan. Verifieraren hittade **ett** fynd
(`package.json` saknar `next`/`react` — som dessutom var falskt, se T5), försökte
laga det, misslyckades, och emitterade fasen `fix-failed`.

`fix-failed` mappas till felstatus utan hänsyn till hur allvarligt fyndet var:

```text
src/lib/hooks/chat/stream-handlers-progress.ts:332-336
const failed =
  phase === "error" ||
  phase === "gave-up" ||
  phase === "fix-failed" ||
  (step === "preview" && phase === "build-failed");
```

Och ett enda felmarkerat steg färgar hela ytan:

```text
src/components/builder/chat/tooling/agent-log.tsx:126
: `Slutsteg (${items.length})${hasFailures ? " · fel" : ""}`}
```

Runtime-sidan skiljer redan på allvar: `src/lib/gen/stream/finalize-version/runner.ts`
(~rad 598–610) beskriver uttryckligen att verifierarens signal i F2 **inte** ska
fälla en version som renderar fine, och att bara render-döda/bygg-brytande klasser
(`undefined-jsx-symbol`, `build-breaking-missing-imports`) hör dit. Klientens
färgsättning känner inte till den skillnaden.

Konsekvens: du kan inte lita på röd färg, och därför inte på grön heller.

## Uppgift

Låt klienten skilja på **rådgivande** och **blockerande** verifieringsutfall, så att
`fix-failed` på ett rådgivande fynd inte färgar Slutsteg rött.

Krav:

- Allvarsgraden ska komma från serverns egen klassning — inte gissas i klienten
  på meddelandetext. Kontrollera vad `verifier`-progressens payload redan bär
  (`src/lib/gen/stream/finalize-version/verifier-phase.ts` ~rad 490–510 emitterar
  `fix-failed`) och skicka med signalen om den saknas.
- Ett **blockerande** `fix-failed` ska fortsätta färga rött precis som i dag.
- Steget ska fortfarande synas som avslutat, inte som en evig spinner. Kommentaren
  i `stream-handlers-progress.ts` (~rad 318–322) varnar uttryckligen: en fas som
  avslutar ett steg måste klassas som completed eller failed, aldrig droppas.
- Rör inte serverns beslut om promotion/verifiering. Detta är en **statusfråga**.

## Vad som INTE ingår

- Lägg inte till en ny badge, pill, banner eller annan visuell yta.
- Ändra inte `productBlocked`-kopplingen till readiness — det är T7.
- Fixa inte `package.json`-fyndet i sig — det är T5.

## Verifiering

- Test i `src/lib/hooks/chat/stream-handlers-progress-state.test.ts` för **båda**
  fallen: rådgivande `fix-failed` → inte felstatus; blockerande `fix-failed` →
  felstatus. Befintligt test på rad ~41 låser dagens beteende och måste uppdateras
  medvetet, inte tas bort.
- Test i `src/components/builder/chat/tooling/BuilderMessageTooling.test.tsx` som
  visar att rubriken inte får `· fel` av ett rådgivande fynd (rad ~192 låser
  dagens beteende).
- `npm run typecheck`
- Riktad vitest på de två sviterna ovan.

## Klart när

En körning som renderar och promotas inte längre kan rubriceras `· fel` av ett
enskilt rådgivande verifieringsfynd, samtidigt som ett verkligt blockerande fynd
fortfarande syns rött.
