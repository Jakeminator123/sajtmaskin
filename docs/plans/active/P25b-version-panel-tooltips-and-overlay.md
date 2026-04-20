---
id: P25b
title: VersionHistory tooltips + version_mismatch overlay-rendering
status: active
created: 2026-04-20
priority: low
wave: 4
parallel_safe_with: [P22b, P28]
blocked_by: [P24, P25]
owner_files:
  - src/components/builder/VersionHistory.tsx
  - src/components/builder/preview-panel/PreviewPanelFrame.tsx
read_only_files:
  - src/components/builder/preview-panel/preview-panel-types.ts
  - src/lib/gen/preview/preview-host-client.ts
  - src/components/builder/BuilderHeader.tsx
  - src/components/builder/GenerationSummary.tsx
validator_hooks:
  - { kind: file-contains, target: src/components/builder/VersionHistory.tsx, expect: "verifyingTooltip" }
  - { kind: file-contains, target: src/components/builder/VersionHistory.tsx, expect: "failedTooltip" }
  - { kind: file-contains, target: src/components/builder/preview-panel/PreviewPanelFrame.tsx, expect: "VersionMismatchOverlayPayload" }
  - { kind: npm-script, target: typecheck }
  - { kind: npm-script, target: lint }
---

# P25b — VersionHistory tooltips + version_mismatch overlay

## Roll & uppgift

Du är en Cursor-agent. P25 levererade CSP + avatar-fixarna men hoppade över tre steg som låg i fel filer. Du ska implementera de tre kvarvarande UX-fixarna nu när P24 har exporterat `VersionMismatchOverlayPayload`-typen och rätt komponenter är identifierade:

1. Hover-tooltip på "Verifying" och "Fel"-badgen i versionspanelen (inte i header).
2. Mjuk "promoted"-badge — visa inte den förrän server-verify rapporterar slutgiltigt.
3. Faktisk overlay-rendering av `VersionMismatchOverlayPayload` i preview-iframens wrapper.

## Filer

| Får ändras | Får läsas (read-only) |
|---|---|
| `src/components/builder/VersionHistory.tsx` | `src/components/builder/preview-panel/preview-panel-types.ts` |
| `src/components/builder/preview-panel/PreviewPanelFrame.tsx` | `src/lib/gen/preview/preview-host-client.ts` |
| | `src/components/builder/BuilderHeader.tsx` |
| | `src/components/builder/GenerationSummary.tsx` |

## Steg

1. **Tooltips** (`VersionHistory.tsx` rad ~587-603, leta efter `lifecycleStatus`-rendering):
   - Lägg till `verifyingTooltip` som hover-text på "Verifying"-badgen: `"Server-side kvalitetskontroll körs i bakgrunden. Påverkar inte preview."`
   - Lägg till `failedTooltip` som hover-text på "Fel"-badgen: `"Verifier hittade blockerande findings — preview funkar ändå, men deploy/build är pausad tills de fixats. Klicka 'Visa diagnostik'."`
   - Använd projektets befintliga tooltip-komponent (sök efter `Tooltip` import i samma fil eller granne).
2. **Mjuk "promoted"-badge** (`VersionHistory.tsx` samma block):
   - Visa inte "promoted" förrän `serverVerifyStatus === "done"` (eller motsvarande slutligt-state). Mellan syntax-pass och server-verify-klar visa "Verifying" istället.
3. **Overlay-rendering** (`PreviewPanelFrame.tsx`):
   - Importera `VersionMismatchOverlayPayload` från `preview-host-client.ts`.
   - Konsumera payload-strömmen (samma path som befintlig `previewLifecycle`-konsumtion). När `versionId` i payload skiljer sig från versionen iframen försöker visa, rendera en transparent overlay med text `"Uppdaterar VM till version <id>…"` ovanpå iframen.
   - Overlay ska försvinna när `currentVersionId === expectedVersionId`.

## Icke-scope

- Ingen ändring av `BuilderHeader.tsx` eller `GenerationSummary.tsx`.
- Ingen ändring av `VersionMismatchOverlayPayload`-typen (P24 äger).
- Ingen ändring av server-verify-policyn eller lifecycle-state-machinen.

## Acceptans

| # | Kommando / Kontroll | Förväntat |
|---|---|---|
| 1 | Visuell verifiering: hover på "Fel"-badge i versionslistan | Tooltip visas med rätt text |
| 2 | Visuell verifiering: hover på "Verifying"-badge | Tooltip visas |
| 3 | Visuell verifiering: snabb generation → "promoted" syns inte förrän server-verify klar | "Verifying" visas mellanstat |
| 4 | Visuell verifiering: trigga version_mismatch (snabb 2:a generation medan 1:a iframen är upp) | Overlay visas med "Uppdaterar VM till version …"-text |
| 5 | `npm run typecheck` + `npm run lint` | exit 0 |
