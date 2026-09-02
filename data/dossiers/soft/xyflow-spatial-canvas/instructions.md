# When to use

Use this dossier only when the brief explicitly asks for a React Flow / XYFlow workspace: an infinite, zoomable, pannable canvas or arbetsyta, an interactive node graph / tankekarta / mindmap, a workflow-editor, or a whiteboard with drag / pan / zoom / minimap. Strong trigger: “visa relationer mellan X som man kan panorera och zooma i”.

Best fit:

- A painter’s tjänsteuniversum, a portfolio of projects, a moodboard, a service map, a roadmap or a family tree — cards in space, optional edges, a detail panel that opens without leaving the canvas.
- A small-business “our world” page where visitors pan and zoom among real offerings, not a static diagram.

Do not use for:

- A static flowchart or process illustration (ordinary page content)
- An org chart as illustration
- A geographic map (`map-display`)
- Charts or dashboards (`dashboard-charts`)
- Three.js / WebGL (`visual-3d`)
- A game canvas (`interactive-game`)
- A sortable card list
- Multiplayer / realtime
- Persistence (that is a separate `database` capability — the canvas works in memory in design mode)

# How to integrate

Emit files 1:1 (keep them under `components/`, never `components/lib/`): `components/spatial-canvas.tsx` → `components/spatial-canvas.tsx` (import `@/components/spatial-canvas`); `components/spatial-card-node.tsx` → `components/spatial-card-node.tsx` (`@/components/spatial-card-node`); `components/spatial-canvas-seed.ts` → `components/spatial-canvas-seed.ts` (`@/components/spatial-canvas-seed`). Add `@xyflow/react` (v12). Keep `spatial-canvas.tsx` verbatim — it owns `ReactFlowProvider`, the stylesheet import, stable `SPATIAL_NODE_TYPES`, embedded scroll safety and the in-memory notice. Relative imports stay `./spatial-card-node` and `./spatial-canvas-seed`. Mount `SpatialCanvas` with seed nodes (type `"card"` is applied inside the wrapper).

```tsx
import { SpatialCanvas } from "@/components/spatial-canvas";
import type { SpatialSeedEdge, SpatialSeedNode } from "@/components/spatial-canvas-seed";

const nodes: SpatialSeedNode[] = [
  { id: "inuti", position: { x: 80, y: 40 }, data: { title: "Invändig målning", description: "Rum, tak och lister i hela huset.", badge: "Tjänst" } },
  { id: "fasad", position: { x: 420, y: 40 }, data: { title: "Fasad", description: "Puts, träfasad och fönster.", badge: "Tjänst" } },
  { id: "tapet", position: { x: 80, y: 220 }, data: { title: "Tapetsering", description: "Borttagning och ny tapet rum för rum." } },
  { id: "offert", position: { x: 420, y: 220 }, data: { title: "Offert", description: "Kostnadsförslag inom tre dagar.", href: "/offert" } },
  { id: "referens", position: { x: 80, y: 400 }, data: { title: "Referenser", description: "Före- och efterbilder från jobb.", href: "/referenser" } },
  { id: "kontakt", position: { x: 420, y: 400 }, data: { title: "Kontakt", description: "Boka ett hembesök i Gävle.", href: "/kontakt" } },
];

const edges: SpatialSeedEdge[] = [
  { id: "e-inuti-offert", source: "inuti", target: "offert" },
  { id: "e-fasad-offert", source: "fasad", target: "offert" },
  { id: "e-tapet-offert", source: "tapet", target: "offert" },
  { id: "e-offert-kontakt", source: "offert", target: "kontakt" },
  { id: "e-referens-kontakt", source: "referens", target: "kontakt" },
];

export function Tjansteuniversum() {
  return (
    <SpatialCanvas
      ariaLabel="Målarens tjänsteuniversum"
      nodes={nodes}
      edges={edges}
      mode="embedded"
      height={520}
    />
  );
}
```

Rewrite node copy and positions per brief. `spatialCanvasSeed` is a generic starting universe. `SpatialCardNode` is already registered; do not re-declare `nodeTypes` at the call site.

# UX rules

- Embedded mode needs an explicit container height (default 520px). Workspace mode fills its parent (`h-full min-h-[480px]`) and may enable scroll zoom.
- Embedded mode must not steal page scroll: `zoomOnScroll={false}`, `preventScrolling={false}`, `panOnScroll={false}`. Pan by drag; zoom via Controls or pinch.
- Nodes stay keyboard-focusable. The detail panel is a real `role="dialog"` with a Stäng button; Escape on the canvas closes it.
- Show `Demo: ändringar sparas inte efter omladdning.` (`role="note"`) only when `editable`. State is in-memory.
- `prefers-reduced-motion: reduce` → `fitView` with `duration: 0`.

# Avoid

- Do not paraphrase `spatial-canvas.tsx` — provider wrap, stylesheet, stable `nodeTypes`, embedded scroll contract and the honest notice are load-bearing.
- Do not define `nodeTypes` inside render (React Flow warns and remounts custom nodes).
- Do not forget `import "@xyflow/react/dist/style.css"` (the verbatim file already does this).
- Do not use this for a static flowchart or process illustration.
- Do not add `localStorage` to fake persistence.
- Do not add auth, database or realtime here.

# Verification

- Pan, zoom, drag (when editable) and select a card; the detail dialog opens with that title.
- Keyboard: a node can take focus; Escape and Stäng close the dialog.
- Embedded mode: wheel over the canvas still scrolls the page.
- Reload in editable mode still shows the not-saved notice; graph changes are gone.
- A spatial-canvas prompt must not also select `visual-3d`.
