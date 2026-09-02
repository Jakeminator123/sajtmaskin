import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SPATIAL_NODE_TYPES,
  SpatialCanvas,
} from "../../../../data/dossiers/soft/xyflow-spatial-canvas/components/spatial-canvas";
import { spatialCanvasSeed } from "../../../../data/dossiers/soft/xyflow-spatial-canvas/components/spatial-canvas-seed";
import { SpatialCardNode } from "../../../../data/dossiers/soft/xyflow-spatial-canvas/components/spatial-card-node";

afterEach(() => {
  cleanup();
});

function renderCanvas(
  props: Partial<Parameters<typeof SpatialCanvas>[0]> = {},
) {
  return render(
    <SpatialCanvas
      nodes={spatialCanvasSeed.nodes}
      edges={spatialCanvasSeed.edges}
      ariaLabel="Våra tjänster"
      {...props}
    />,
  );
}

describe("spatialCanvasSeed", () => {
  it("has six unique nodes with deterministic positions and five connected edges", () => {
    expect(spatialCanvasSeed.nodes).toHaveLength(6);
    const ids = spatialCanvasSeed.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(6);
    const positions = spatialCanvasSeed.nodes.map(
      (node) => `${node.position.x},${node.position.y}`,
    );
    expect(new Set(positions).size).toBe(6);
    for (const node of spatialCanvasSeed.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }

    expect(spatialCanvasSeed.edges).toHaveLength(5);
    const nodeIds = new Set(ids);
    for (const edge of spatialCanvasSeed.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});

describe("SpatialCanvas", () => {
  it("renders one card per node, one edge per seed edge, and chrome by default", () => {
    renderCanvas();

    expect(screen.getAllByRole("article")).toHaveLength(spatialCanvasSeed.nodes.length);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(
      spatialCanvasSeed.nodes.length,
    );
    expect(screen.getAllByTestId("rf-edge")).toHaveLength(spatialCanvasSeed.edges.length);
    expect(screen.getByTestId("rf-background")).toBeTruthy();
    expect(screen.getByTestId("rf-controls")).toBeTruthy();
    expect(screen.getByTestId("rf-minimap")).toBeTruthy();
  });

  it("hides minimap and controls when asked", () => {
    renderCanvas({ showMinimap: false, showControls: false });

    expect(screen.queryByTestId("rf-minimap")).toBeNull();
    expect(screen.queryByTestId("rf-controls")).toBeNull();
  });

  it("uses embedded scroll safety and a 520px height by default", () => {
    renderCanvas();

    const flow = screen.getByTestId("react-flow");
    expect(flow.getAttribute("data-zoom-on-scroll")).toBe("false");
    expect(flow.getAttribute("data-prevent-scrolling")).toBe("false");
    expect(screen.getByRole("region").style.height).toBe("520px");
  });

  it("enables workspace scroll zoom and drops the inline height", () => {
    renderCanvas({ mode: "workspace" });

    const flow = screen.getByTestId("react-flow");
    expect(flow.getAttribute("data-zoom-on-scroll")).toBe("true");
    expect(flow.getAttribute("data-prevent-scrolling")).toBe("true");
    expect(screen.getByRole("region").style.height).toBe("");
  });

  it("is not editable by default and shows the notice only when editable", () => {
    const { rerender } = renderCanvas();

    expect(screen.getByTestId("react-flow").getAttribute("data-nodes-draggable")).toBe(
      "false",
    );
    expect(screen.queryByRole("note")).toBeNull();

    rerender(
      <SpatialCanvas
        nodes={spatialCanvasSeed.nodes}
        edges={spatialCanvasSeed.edges}
        ariaLabel="Våra tjänster"
        editable
      />,
    );

    expect(screen.getByTestId("react-flow").getAttribute("data-nodes-draggable")).toBe(
      "true",
    );
    expect(screen.getByRole("note").textContent).toMatch(/ändringar sparas inte/);
  });

  it("opens a detail dialog on node click and closes it with Stäng and Escape", () => {
    const onSelect = vi.fn();
    const first = spatialCanvasSeed.nodes[0];
    renderCanvas({ onSelect });

    fireEvent.click(screen.getByRole("heading", { level: 3, name: first.data.title }));
    expect(screen.getByRole("dialog", { name: first.data.title })).toBeTruthy();
    expect(onSelect).toHaveBeenCalledWith(first);

    fireEvent.click(screen.getByRole("button", { name: "Stäng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSelect).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByRole("heading", { level: 3, name: first.data.title }));
    expect(screen.getByRole("dialog", { name: first.data.title })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("exports a module-level SPATIAL_NODE_TYPES.card that stays stable across renders", () => {
    expect(SPATIAL_NODE_TYPES.card).toBe(SpatialCardNode);
    const first = SPATIAL_NODE_TYPES;
    const { rerender } = renderCanvas();
    rerender(
      <SpatialCanvas
        nodes={spatialCanvasSeed.nodes}
        edges={spatialCanvasSeed.edges}
        ariaLabel="Våra tjänster"
      />,
    );
    expect(SPATIAL_NODE_TYPES).toBe(first);
    expect(SPATIAL_NODE_TYPES.card).toBe(first.card);
  });
});

describe("SpatialCardNode", () => {
  it("renders title, badge, image with alt=title, and top/bottom handles", () => {
    render(
      <SpatialCardNode
        id="card-1"
        data={{
          title: "Fasad",
          badge: "Ute",
          description: "Målning utomhus",
          imageUrl: "/fasad.jpg",
        }}
        selected
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Fasad" })).toBeTruthy();
    expect(screen.getByText("Ute")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Fasad" }).getAttribute("src")).toBe("/fasad.jpg");

    const handles = screen.getAllByTestId("rf-handle");
    expect(handles).toHaveLength(2);
    expect(handles[0].getAttribute("data-type")).toBe("target");
    expect(handles[0].getAttribute("data-position")).toBe("top");
    expect(handles[1].getAttribute("data-type")).toBe("source");
    expect(handles[1].getAttribute("data-position")).toBe("bottom");
  });
});
