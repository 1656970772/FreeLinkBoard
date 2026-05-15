import type { BoardEdge, BoardNode, EdgeEndpoint, Point } from "../../domain/board/types";
import type { Bounds } from "./bounds";
import { approximateEdgePathPoints } from "./edgePathGeometry";

export { resolveEdgeEndpoint } from "./edgePathGeometry";

export type EdgePath = {
  key: string;
  points: Point[];
  bounds: Bounds;
};

const EMPTY_BOUNDS: Bounds = { x: 0, y: 0, width: -1, height: -1 };

export function createEdgePath(edge: BoardEdge, nodes: Record<string, BoardNode>): EdgePath {
  const points = approximateEdgePathPoints(edge, nodes);

  return {
    key: createEdgePathKey(edge, nodes),
    points,
    bounds: getPointsBounds(points)
  };
}

export class EdgePathCache {
  private readonly pathsByEdgeId = new Map<string, EdgePath>();

  get(edge: BoardEdge, nodes: Record<string, BoardNode>): EdgePath {
    const key = createEdgePathKey(edge, nodes);
    const cached = this.pathsByEdgeId.get(edge.id);

    if (cached?.key === key) {
      return cached;
    }

    const path = createEdgePath(edge, nodes);
    this.pathsByEdgeId.set(edge.id, path);
    return path;
  }

  clear(): void {
    this.pathsByEdgeId.clear();
  }
}

function createEdgePathKey(edge: BoardEdge, nodes: Record<string, BoardNode>): string {
  return [
    edge.id,
    edge.pathType,
    endpointKey(edge.from, nodes),
    endpointKey(edge.to, nodes),
    `fixed:${edge.fixedPoints.map(pointKey).join(";")}`
  ].join("|");
}

function endpointKey(endpoint: EdgeEndpoint, nodes: Record<string, BoardNode>): string {
  if (endpoint.type === "point") {
    return `point:${pointKey(endpoint.point)}`;
  }

  const node = nodes[endpoint.nodeId];
  if (!node) {
    return `node:${endpoint.nodeId}:missing`;
  }

  return `node:${endpoint.nodeId}:${node.position.x},${node.position.y},${node.size.width},${node.size.height}`;
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`;
}

function getPointsBounds(points: Point[]): Bounds {
  if (points.length === 0) {
    return EMPTY_BOUNDS;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 32;

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  };
}
