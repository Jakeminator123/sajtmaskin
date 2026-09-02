/**
 * Test stub for `@xyflow/react` — a dependency of the GENERATED site (the
 * xyflow-spatial-canvas dossier ships it via manifest `dependencies`), not of
 * this repo. Dossier components import named React Flow helpers at module top,
 * so unit tests and `tsc` need the import to resolve. Wired via the
 * `@xyflow/react` alias in `vitest.config.ts` and `tsconfig.json` (see
 * tests/stubs/README.md). Every export is an inert, typed stand-in of the
 * subset the dossier actually touches.
 *
 * Deliberately NOT used by the warm-cache pre-VM typecheck: that pass drops
 * undecidable module errors instead (`src/lib/gen/preview/generated-only-modules.ts`).
 */

import {
  createElement,
  useMemo,
  useState,
  type ComponentType,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

declare module "@xyflow/react/dist/style.css" {}

export interface Node<D = Record<string, unknown>> {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: D;
  selected?: boolean;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Connection {
  source: string | null;
  target: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface NodeProps<N extends Node = Node> {
  id: string;
  data: N["data"];
  selected?: boolean;
  type?: string;
}

export type NodeTypes = Record<string, ComponentType<NodeProps>>;

export type NodeMouseHandler = (event: MouseEvent, node: Node) => void;

export type OnNodesChange = (changes: unknown[]) => void;
export type OnEdgesChange = (changes: unknown[]) => void;

export const Position = {
  Top: "top",
  Bottom: "bottom",
  Left: "left",
  Right: "right",
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export function ReactFlowProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

interface ReactFlowProps {
  nodes?: Node[];
  edges?: Edge[];
  nodeTypes?: NodeTypes;
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  onConnect?: (connection: Connection) => void;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  fitView?: boolean;
  fitViewOptions?: { padding?: number; duration?: number };
  minZoom?: number;
  maxZoom?: number;
  zoomOnScroll?: boolean;
  panOnScroll?: boolean;
  preventScrolling?: boolean;
  zoomOnDoubleClick?: boolean;
  onNodeClick?: NodeMouseHandler;
  onPaneClick?: (event: MouseEvent<HTMLDivElement>) => void;
  proOptions?: { hideAttribution?: boolean };
  children?: ReactNode;
}

function DefaultNode({ data }: NodeProps) {
  const title = typeof data.title === "string" ? data.title : "";
  return <div>{title}</div>;
}

export function ReactFlow(props: ReactFlowProps) {
  const nodes = props.nodes ?? [];
  const edges = props.edges ?? [];

  return (
    <div
      data-testid="react-flow"
      data-zoom-on-scroll={String(!!props.zoomOnScroll)}
      data-prevent-scrolling={String(!!props.preventScrolling)}
      data-nodes-draggable={String(!!props.nodesDraggable)}
      onClick={props.onPaneClick}
    >
      {nodes.map((node) => {
        const NodeComponent = props.nodeTypes?.[node.type ?? "default"] ?? DefaultNode;
        return (
          <div
            key={node.id}
            data-testid="rf-node"
            data-node-id={node.id}
            onClick={(event) => {
              event.stopPropagation();
              props.onNodeClick?.(event, node);
            }}
          >
            {createElement(NodeComponent, {
              id: node.id,
              data: node.data,
              selected: node.selected,
              type: node.type,
            })}
          </div>
        );
      })}
      {edges.map((edge) => (
        <div key={edge.id} data-testid="rf-edge" data-edge-id={edge.id} />
      ))}
      {props.children}
    </div>
  );
}

export function Background() {
  return <div data-testid="rf-background" />;
}

export function Controls(_props: { showInteractive?: boolean }) {
  return <div data-testid="rf-controls" />;
}

export function MiniMap(_props: { pannable?: boolean; zoomable?: boolean }) {
  return <div data-testid="rf-minimap" />;
}

export function Panel({ position, children }: { position: string; children?: ReactNode }) {
  return (
    <div data-testid="rf-panel" data-position={position}>
      {children}
    </div>
  );
}

export function Handle({ type, position }: { type: "source" | "target"; position: Position }) {
  return <span data-testid="rf-handle" data-type={type} data-position={position} />;
}

export function addEdge(connection: Connection, edges: Edge[]): Edge[] {
  if (!connection.source || !connection.target) return edges;
  const duplicate = edges.some(
    (edge) => edge.source === connection.source && edge.target === connection.target,
  );
  if (duplicate) return edges;
  return [
    ...edges,
    {
      id: `e-${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
    },
  ];
}

const noopChange: OnNodesChange = () => {};

export function useNodesState<NodeType extends Node = Node>(
  initialNodes: NodeType[],
): [NodeType[], Dispatch<SetStateAction<NodeType[]>>, OnNodesChange] {
  const [state, setState] = useState(initialNodes);
  return [state, setState, noopChange];
}

export function useEdgesState<EdgeType extends Edge = Edge>(
  initialEdges: EdgeType[],
): [EdgeType[], Dispatch<SetStateAction<EdgeType[]>>, OnEdgesChange] {
  const [state, setState] = useState(initialEdges);
  return [state, setState, noopChange];
}

export function useReactFlow() {
  return useMemo(
    () => ({
      fitView: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
    }),
    [],
  );
}
