import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpatialIndex } from "../../../src/application/geometry/SpatialIndex";
import type { BoardEdge, BoardNode, BoardState } from "../../../src/domain/board/types";

const mockCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn()
};

const createNode = (id: string, x: number, y: number, text: string): BoardNode => ({
  id,
  type: "text",
  position: { x, y },
  size: { width: 160, height: 56 },
  sizing: "fixed",
  text,
  style: {
    borderColor: "#24221f",
    backgroundColor: "#fffdf8",
    textColor: "#24221f"
  }
});

const createEdge = (id: string): BoardEdge => ({
  id,
  from: { type: "node", nodeId: "visible" },
  to: { type: "node", nodeId: "also-visible" },
  pathType: "straight",
  arrow: "end",
  stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
  fixedPoints: []
});

const createBoard = (zoom = 1): BoardState => ({
  id: "board-1",
  title: "Board",
  viewport: { x: 0, y: 0, zoom },
  nodes: {
    visible: createNode("visible", 20, 20, "Visible node detail text"),
    "also-visible": createNode("also-visible", 220, 120, "Another visible node"),
    hidden: createNode("hidden", 1200, 900, "Hidden node detail text")
  },
  edges: {
    edge_1: createEdge("edge_1")
  },
  selection: { nodeIds: [], edgeIds: [] },
  createdAt: "2026-05-15T00:00:00.000Z",
  updatedAt: "2026-05-15T00:00:00.000Z"
});

describe("BoardCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => mockCanvasContext as unknown as CanvasRenderingContext2D)
    });
  });

  it("renders stable layer roots", async () => {
    const { BoardCanvas } = await import("../../../src/renderer/board/BoardCanvas");

    render(<BoardCanvas board={createBoard()} size={{ width: 640, height: 360 }} />);

    expect(screen.getByTestId("board-canvas")).toBeTruthy();
    expect(screen.getByTestId("grid-canvas-layer")).toBeTruthy();
    expect(screen.getByTestId("edge-canvas-layer")).toBeTruthy();
    expect(screen.getByTestId("node-dom-layer")).toBeTruthy();
    expect(screen.getByTestId("interaction-overlay-layer")).toBeTruthy();
  });

  it("renders only visible nodes in the DOM layer", async () => {
    const { BoardCanvas } = await import("../../../src/renderer/board/BoardCanvas");

    render(<BoardCanvas board={createBoard()} size={{ width: 640, height: 360 }} />);

    expect(screen.getByTestId("board-node-visible")).toBeTruthy();
    expect(screen.getByTestId("board-node-also-visible")).toBeTruthy();
    expect(screen.queryByTestId("board-node-hidden")).toBeNull();
  });

  it("keeps node text stable when zoomed out", async () => {
    const { BoardCanvas } = await import("../../../src/renderer/board/BoardCanvas");

    render(<BoardCanvas board={createBoard(0.25)} size={{ width: 640, height: 360 }} />);

    const content = screen.getByTestId("board-node-content-visible");
    expect(screen.getByTestId("board-node-visible").textContent).toBe("Visible node detail text");
    expect(content.style.fontSize).toBe("14px");
    expect(content.style.whiteSpace).toBe("pre-wrap");
  });

  it("queries spatial indexes when resolving visible canvas layers", async () => {
    const querySpy = vi.spyOn(SpatialIndex.prototype, "query");
    const { BoardCanvas } = await import("../../../src/renderer/board/BoardCanvas");

    render(<BoardCanvas board={createBoard()} size={{ width: 640, height: 360 }} />);

    expect(querySpy).toHaveBeenCalled();
    expect(querySpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
