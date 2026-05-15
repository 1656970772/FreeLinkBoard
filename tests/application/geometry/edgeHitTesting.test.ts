import { describe, expect, it } from "vitest";
import {
  approximateEdgePathPoints,
  findNearestSegmentInsertionIndex,
  hitTestEdges
} from "../../../src/application/geometry/edgeHitTesting";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";

const nodes: Record<string, BoardNode> = {
  source: {
    id: "source",
    type: "text",
    position: { x: 100, y: 100 },
    size: defaultBoardSettings.textNodeSize,
    sizing: "fixed",
    text: "Source",
    style: defaultBoardSettings.textNodeStyle
  },
  target: {
    id: "target",
    type: "text",
    position: { x: 420, y: 120 },
    size: defaultBoardSettings.textNodeSize,
    sizing: "fixed",
    text: "Target",
    style: defaultBoardSettings.textNodeStyle
  }
};

function createEdge(pathType: BoardEdge["pathType"]): BoardEdge {
  return {
    id: `edge-${pathType}`,
    from: { type: "node", nodeId: "source" },
    to: { type: "node", nodeId: "target" },
    fixedPoints: [],
    pathType,
    arrow: "end",
    stroke: defaultBoardSettings.edgeStyle.stroke
  };
}

describe("edge hit testing", () => {
  it("samples straight, bezier, and rounded elbow paths for hit testing", () => {
    expect(approximateEdgePathPoints(createEdge("straight"), nodes)).toEqual([
      { x: 180, y: 128 },
      { x: 500, y: 148 }
    ]);
    expect(approximateEdgePathPoints(createEdge("bezier"), nodes).length).toBeGreaterThan(8);
    expect(approximateEdgePathPoints(createEdge("roundedElbow"), nodes)).toContainEqual({ x: 340, y: 128 });
  });

  it("finds the nearest edge within screen tolerance", () => {
    const hit = hitTestEdges([createEdge("straight")], nodes, { x: 340, y: 138 }, { x: 0, y: 0, zoom: 1 }, 10);

    expect(hit?.edgeId).toBe("edge-straight");
    expect(hit?.worldPoint).toEqual({ x: 340, y: 138 });
  });

  it("returns insertion index after the nearest segment start", () => {
    const edge = {
      ...createEdge("straight"),
      fixedPoints: [{ x: 320, y: 180 }]
    };
    const points = approximateEdgePathPoints(edge, nodes);

    expect(findNearestSegmentInsertionIndex(points, { x: 360, y: 170 })).toBe(1);
  });

  it("returns the original anchor segment insertion index for bezier hit tests", () => {
    const edge = {
      ...createEdge("bezier"),
      fixedPoints: [{ x: 320, y: 180 }]
    };

    const hit = hitTestEdges([edge], nodes, { x: 405, y: 172 }, { x: 0, y: 0, zoom: 1 }, 20);

    expect(hit?.insertionIndex).toBe(1);
  });

  it("returns the original anchor segment insertion index for rounded elbow hit tests", () => {
    const edge = {
      ...createEdge("roundedElbow"),
      fixedPoints: [{ x: 320, y: 180 }]
    };

    const hit = hitTestEdges([edge], nodes, { x: 410, y: 180 }, { x: 0, y: 0, zoom: 1 }, 10);

    expect(hit?.insertionIndex).toBe(1);
  });

  it("skips edges with missing node endpoints instead of hit testing from the origin", () => {
    const missingSourceEdge = {
      ...createEdge("straight"),
      from: { type: "node", nodeId: "missing-source" }
    } satisfies BoardEdge;

    expect(hitTestEdges([missingSourceEdge], nodes, { x: 0, y: 0 }, { x: 0, y: 0, zoom: 1 }, 32)).toBeNull();
  });
});
