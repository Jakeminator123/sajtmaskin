"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { SpatialCanvasNodeData } from "./spatial-canvas-seed";

export function SpatialCardNode({ data, selected }: NodeProps) {
  const card = data as unknown as SpatialCanvasNodeData;

  return (
    <article
      tabIndex={0}
      className={`rounded-lg border bg-card p-3 shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}
    >
      {card.badge ? <p className="text-xs text-muted-foreground">{card.badge}</p> : null}
      <h3 className="text-sm font-semibold">{card.title}</h3>
      {card.imageUrl ? (
        <img src={card.imageUrl} alt={card.title} className="mt-2 h-24 w-full rounded object-cover" />
      ) : null}
      {card.description ? (
        <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
      ) : null}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </article>
  );
}
