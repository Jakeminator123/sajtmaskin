# P09: Preview-klar badge — spegla VM-readiness

## Problem

"Preview-klar"-badgen i `VersionHistory.tsx` baseras på version-tier
(har URL / `hasTier2LivePreviewUrl`), inte på om VM:en faktiskt är uppe.
Badgen visas även när VM:n fortfarande bootar.

Kort sagt: dagens badge betyder i praktiken **"den här versionen har en tier-2-preview-URL"**,
inte **"preview-host svarar just nu"**. Frågan i det här spåret är om badgen ska fortsätta
representera URL/status på versionsnivå, eller om den ska representera faktisk runtime-readiness.

## Filer att ändra

- `src/lib/db/engine-version-lifecycle.ts` — `resolveQualityTier()`
  - Möjligt: lägg till parameter `vmReady?: boolean` som krävs för "preview".
  
- `src/components/builder/VersionHistory.tsx` (~rad 558-626)
  - Alternativt: visa en separat "VM bootar"-indikator (Loader2-ikon) istället
    för att dölja badgen.

- `src/components/builder/preview-panel/PreviewPanelEmptyState.tsx`
  - Redan hanterar `previewPending` / `previewLifecycle` separat.

## Risker

- Heartbeat-baserad ready-status kan flaxa (VM uppe → restart → uppe).
- Bättre att kombinera: "Preview-klar" som badge + dimma/spinner om VM inte svarar.

## Prioritet

Medel — UX-vilseledande men inte funktionellt blockerande.
