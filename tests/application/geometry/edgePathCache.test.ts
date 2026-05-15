import { describe, expect, it } from "vitest";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";
import { EdgePathCache, createEdgePath, resolveEdgeEndpoint } from "../../../src/application/geometry/edgePathCache";

const nodes: Record<string, BoardNode> = {
  "node-a": {
    id: "node-a",
    type: "text",
    position: { x: 100, y: 200 },
    size: { width: 160, height: 80 },
    sizing: "fixed",
    text: "A",
    style: { borderColor: "#000", backgroundColor: "#fff", textColor: "#111" }
  },
  "node-b": {
    id: "node-b",
    type: "text",
    position: { x: 400, y: 100 },
    size: { width: 120, height: 60 },
    sizing: "fixed",
    text: "B",
    style: { borderColor: "#000", backgroundColor: "#fff", textColor: "#111" }
  }
};

const edge: BoardEdge = {
  id: "edge-a",
  from: { type: "node", nodeId: "node-a" },
  to: { type: "node", nodeId: "node-b" },
  pathType: "straight",
  arrow: "end",
  stroke: { color: "#333", width: 2, dash: "solid" },
  fixedPoints: [{ x: 280, y: 260 }]
};

describe("edge path cache", () => {
  it("resolves node endpoints to node centers for M2", () => {
    expect(resolveEdgeEndpoint({ type: "node", nodeId: "node-a" }, nodes)).toEqual({ x: 180, y: 240 });
  });

  it("resolves point endpoints directly", () => {
    expect(resolveEdgeEndpoint({ type: "point", point: { x: 12, y: 34 } }, nodes)).toEqual({ x: 12, y: 34 });
  });

  it("creates deterministic path points and bounds", () => {
    expect(createEdgePath(edge, nodes)).toEqual({
      key: "edge-a|straight|node:node-a:100,200,160,80|node:node-b:400,100,120,60|fixed:280,260",
      points: [
        { x: 180, y: 240 },
        { x: 280, y: 260 },
        { x: 460, y: 130 }
      ],
      bounds: { x: 180, y: 130, width: 280, height: 130 }
    });
  });

  it("returns the same path object for unchanged edge and node geometry", () => {
    const cache = new EdgePathCache();

    expect(cache.get(edge, nodes)).toBe(cache.get(edge, nodes));
  });

  it("invalidates cached paths when endpoint node geometry changes", () => {
    const cache = new EdgePathCache();
    const before = cache.get(edge, nodes);
    const movedNodes = {
      ...nodes,
      "node-a": {
        ...nodes["node-a"]!,
        position: { x: 120, y: 200 }
      }
    };

    const after = cache.get(edge, movedNodes);

    expect(after).not.toBe(before);
    expect(after.points[0]).toEqual({ x: 200, y: 240 });
  });
});
