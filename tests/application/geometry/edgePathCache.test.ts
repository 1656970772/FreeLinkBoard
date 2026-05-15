import { describe, expect, it } from "vitest";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";
import { EdgePathCache, createEdgePath, resolveEdgeEndpoint } from "../../../src/application/geometry/edgePathCache";
import { approximateEdgePathPoints } from "../../../src/application/geometry/edgeHitTesting";
import { SpatialIndex } from "../../../src/application/geometry/SpatialIndex";

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

  it("projects node path endpoints to the node boundary toward adjacent anchors", () => {
    const path = createEdgePath(edge, nodes);

    expect(path.points[0]).toEqual({ x: 260, y: 256 });
    expect(path.points.at(-1)).toEqual({ x: 418.46153846153845, y: 160 });
    expectPointToBeOnNodeBoundary(path.points[0]!, nodes["node-a"]!);
    expectPointToBeOnNodeBoundary(path.points.at(-1)!, nodes["node-b"]!);
  });

  it("keeps point endpoints fixed while projecting node endpoints", () => {
    const pointToNodeEdge = {
      ...edge,
      from: { type: "point", point: { x: 280, y: 260 } },
      fixedPoints: []
    } satisfies BoardEdge;
    const path = createEdgePath(pointToNodeEdge, nodes);

    expect(path.points[0]).toEqual({ x: 280, y: 260 });
    expect(path.points.at(-1)).toEqual({ x: 418.46153846153845, y: 160 });
    expectPointToBeOnNodeBoundary(path.points.at(-1)!, nodes["node-b"]!);
  });

  it("resolves point endpoints directly", () => {
    expect(resolveEdgeEndpoint({ type: "point", point: { x: 12, y: 34 } }, nodes)).toEqual({ x: 12, y: 34 });
  });

  it("does not resolve missing node endpoints to the origin", () => {
    expect(resolveEdgeEndpoint({ type: "node", nodeId: "missing-node" }, nodes)).toBeNull();
  });

  it("creates deterministic path points and bounds", () => {
    expect(createEdgePath(edge, nodes)).toEqual({
      key: "edge-a|straight|node:node-a:100,200,160,80|node:node-b:400,100,120,60|fixed:280,260",
      points: [
        { x: 260, y: 256 },
        { x: 280, y: 260 },
        { x: 418.46153846153845, y: 160 }
      ],
      bounds: { x: 228, y: 128, width: 222.46153846153845, height: 164 }
    });
  });

  it("covers sampled bezier points that overshoot reverse long-distance anchors", () => {
    const reverseBezierEdge: BoardEdge = {
      id: "edge-reverse-bezier",
      from: { type: "point", point: { x: 1000, y: 100 } },
      to: { type: "point", point: { x: 0, y: 140 } },
      pathType: "bezier",
      arrow: "end",
      stroke: { color: "#333", width: 2, dash: "solid" },
      fixedPoints: []
    };

    const path = createEdgePath(reverseBezierEdge, nodes);
    const sampledPoints = approximateEdgePathPoints(reverseBezierEdge, nodes);
    const right = path.bounds.x + path.bounds.width;
    const bottom = path.bounds.y + path.bounds.height;

    expect(sampledPoints.some((point) => point.x > 1032 || point.x < -32)).toBe(true);
    expect(sampledPoints.every((point) => point.x >= path.bounds.x && point.x <= right)).toBe(true);
    expect(sampledPoints.every((point) => point.y >= path.bounds.y && point.y <= bottom)).toBe(true);
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
    expect(after.points[0]).toEqual({ x: 280, y: 260 });
  });

  it("returns an unindexed empty path when an endpoint node is missing", () => {
    const invalidEdge = {
      ...edge,
      from: { type: "node", nodeId: "missing-node" }
    } satisfies BoardEdge;
    const path = createEdgePath(invalidEdge, nodes);
    const index = new SpatialIndex();

    index.upsert(invalidEdge.id, path.bounds);

    expect(path.points).toEqual([]);
    expect(path.bounds).toEqual({ x: 0, y: 0, width: -1, height: -1 });
    expect(index.query({ x: -32, y: -32, width: 64, height: 64 })).toEqual([]);
  });
});

function expectPointToBeOnNodeBoundary(point: { x: number; y: number }, node: BoardNode): void {
  const left = node.position.x;
  const right = node.position.x + node.size.width;
  const top = node.position.y;
  const bottom = node.position.y + node.size.height;
  const onVerticalEdge = (point.x === left || point.x === right) && point.y >= top && point.y <= bottom;
  const onHorizontalEdge = (point.y === top || point.y === bottom) && point.x >= left && point.x <= right;

  expect(onVerticalEdge || onHorizontalEdge).toBe(true);
}
