"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import { useCallback, useEffect, useState } from "react";

import { SpatialCardNode } from "./spatial-card-node";
import type {
  SpatialCanvasNodeData,
  SpatialSeedEdge,
  SpatialSeedNode,
} from "./spatial-canvas-seed";

export const SPATIAL_NODE_TYPES = { card: SpatialCardNode };

export interface SpatialCanvasProps {
  nodes: SpatialSeedNode[];
  edges?: SpatialSeedEdge[];
  ariaLabel: string;
  className?: string;
  mode?: "embedded" | "workspace";
  height?: number;
  editable?: boolean;
  showMinimap?: boolean;
  showControls?: boolean;
  onSelect?: (node: SpatialSeedNode | null) => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function toRfNodes(nodes: SpatialSeedNode[]): Node[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "card",
    position: node.position,
    data: node.data as unknown as Node["data"],
  }));
}

function toRfEdges(edges: SpatialSeedEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
  }));
}

function SpatialCanvasInner({
  nodes,
  edges = [],
  ariaLabel,
  className,
  mode = "embedded",
  height = 520,
  editable = false,
  showMinimap = true,
  showControls = true,
  onSelect,
}: SpatialCanvasProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { fitView } = useReactFlow();
  const [rfNodes, _setRfNodes, onNodesChange] = useNodesState<Node>(toRfNodes(nodes));
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(toRfEdges(edges));
  const [selected, setSelected] = useState<SpatialSeedNode | null>(null);

  const select = useCallback(
    (node: SpatialSeedNode | null) => {
      setSelected(node);
      onSelect?.(node);
    },
    [onSelect],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const seed =
        nodes.find((item) => item.id === node.id) ?? {
          id: node.id,
          position: node.position,
          data: node.data as unknown as SpatialCanvasNodeData,
        };
      select(seed);
    },
    [nodes, select],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setRfEdges((current) => addEdge(connection, current));
    },
    [setRfEdges],
  );

  const wrapperClass = [
    "relative w-full overflow-hidden rounded-xl border bg-background",
    mode === "workspace" ? "h-full min-h-[480px]" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-spatial-mode={mode}
      data-spatial-editable={editable}
      tabIndex={-1}
      className={wrapperClass}
      style={mode === "embedded" ? { height } : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") select(null);
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={SPATIAL_NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={editable ? onConnect : undefined}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.2, duration: reducedMotion ? 0 : 300 }}
        minZoom={0.3}
        maxZoom={2}
        zoomOnScroll={mode === "workspace"}
        panOnScroll={false}
        preventScrolling={mode === "workspace"}
        zoomOnDoubleClick={false}
        onNodeClick={handleNodeClick}
        onPaneClick={() => select(null)}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        {showControls ? <Controls showInteractive={false} /> : null}
        {showMinimap ? <MiniMap pannable zoomable={false} /> : null}
        <Panel position="top-left">
          <button
            type="button"
            className="rounded-md border bg-card px-3 py-1.5 text-xs shadow"
            onClick={() => fitView()}
          >
            Anpassa vyn
          </button>
        </Panel>
        {editable ? (
          <Panel position="bottom-left">
            <p
              role="note"
              className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              Demo: ändringar sparas inte efter omladdning.
            </p>
          </Panel>
        ) : null}
      </ReactFlow>
      {selected ? (
        <aside
          role="dialog"
          aria-label={selected.data.title}
          className="absolute right-3 top-3 z-10 w-72 max-w-[calc(100%-1.5rem)] rounded-xl border bg-card p-4 shadow"
        >
          {selected.data.badge ? (
            <p className="text-xs text-muted-foreground">{selected.data.badge}</p>
          ) : null}
          <h2 className="text-lg font-semibold">{selected.data.title}</h2>
          {selected.data.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{selected.data.description}</p>
          ) : null}
          {selected.data.href ? (
            <a href={selected.data.href} className="mt-3 inline-block text-sm underline">
              Läs mer
            </a>
          ) : null}
          <button type="button" className="mt-4 text-sm underline" onClick={() => select(null)}>
            Stäng
          </button>
        </aside>
      ) : null}
    </div>
  );
}

export function SpatialCanvas(props: SpatialCanvasProps) {
  return (
    <ReactFlowProvider>
      <SpatialCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
