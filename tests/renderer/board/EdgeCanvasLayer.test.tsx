import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";
import { EdgeCanvasLayer } from "../../../src/renderer/board/layers/EdgeCanvasLayer";

const mockCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn(),
  set fillStyle(value: string) {
    fillStyleValues.push(value);
  },
  set lineWidth(value: number) {
    lineWidthValues.push(value);
  },
  set strokeStyle(value: string) {
    strokeStyleValues.push(value);
  }
};

const lineWidthValues: number[] = [];
const strokeStyleValues: string[] = [];
const fillStyleValues: string[] = [];

const nodes: Record<string, BoardNode> = {};

function createEdge(overrides: Partial<BoardEdge>): BoardEdge {
  return {
    id: "edge",
    from: { type: "point", point: { x: 20, y: 40 } },
    to: { type: "point", point: { x: 220, y: 100 } },
    pathType: "straight",
    arrow: "none",
    stroke: { color: "#2f6f6a", width: 3, dash: "solid" },
    fixedPoints: [],
    ...overrides
  };
}

function renderLayer(edges: BoardEdge[], selectedEdgeIds: string[] = []): void {
  render(
    <EdgeCanvasLayer
      edges={edges}
      nodes={nodes}
      selectedEdgeIds={selectedEdgeIds}
      size={{ width: 400, height: 240 }}
      viewport={{ x: 0, y: 0, zoom: 1 }}
    />
  );
}

describe("EdgeCanvasLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lineWidthValues.length = 0;
    strokeStyleValues.length = 0;
    fillStyleValues.length = 0;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => mockCanvasContext as unknown as CanvasRenderingContext2D)
    });
  });

  it("draws straight and bezier paths from shared sampled geometry", () => {
    renderLayer([
      createEdge({ id: "straight", pathType: "straight" }),
      createEdge({ id: "bezier", pathType: "bezier" })
    ]);

    expect(mockCanvasContext.moveTo).toHaveBeenCalledWith(20, 40);
    expect(mockCanvasContext.lineTo).toHaveBeenCalledWith(220, 100);
    expect(mockCanvasContext.lineTo).toHaveBeenCalledWith(41.12268518518518, 41.18055555555556);
  });

  it("rounds elbow corners with quadratic curves based on shared sampled geometry", () => {
    renderLayer([createEdge({ id: "elbow", pathType: "roundedElbow" })]);

    expect(mockCanvasContext.quadraticCurveTo).toHaveBeenCalledWith(120, 40, expect.any(Number), expect.any(Number));
    expect(mockCanvasContext.quadraticCurveTo).toHaveBeenCalledWith(120, 100, expect.any(Number), expect.any(Number));
  });

  it("applies dashed stroke styling and widens selected edges", () => {
    renderLayer([createEdge({ id: "selected", stroke: { color: "#d33f49", width: 4, dash: "dashed" } })], [
      "selected"
    ]);

    expect(mockCanvasContext.setLineDash).toHaveBeenCalledWith([8, 8]);
    expect(strokeStyleValues).toContain("#d33f49");
    expect(lineWidthValues).toContain(6);
  });

  it("draws arrowheads at both endpoints when requested", () => {
    renderLayer([createEdge({ arrow: "both" })]);

    expect(mockCanvasContext.fill).toHaveBeenCalledTimes(2);
    expect(fillStyleValues).toEqual(["#2f6f6a", "#2f6f6a"]);
  });
});
