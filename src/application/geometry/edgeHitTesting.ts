import type { BoardEdge, BoardNode, Point, Viewport } from "../../domain/board/types";
import { approximateEdgePathSegments, type EdgePathSegmentSamples } from "./edgePathGeometry";
import { screenToWorld } from "./viewportTransform";

export {
  approximateEdgePathPoints,
  approximateEdgePathSegments,
  type EdgePathSegmentSamples
} from "./edgePathGeometry";

export type EdgeHit = {
  edgeId: string;
  worldPoint: Point;
  insertionIndex: number;
  distance: number;
};

export function hitTestEdges(
  edges: BoardEdge[],
  nodes: Record<string, BoardNode>,
  screenPoint: Point,
  viewport: Viewport,
  screenTolerance = 8
): EdgeHit | null {
  const worldPoint = screenToWorld(screenPoint, viewport);
  const worldTolerance = screenTolerance / viewport.zoom;
  let closest: EdgeHit | null = null;

  for (const edge of edges) {
    const nearestSegment = findNearestSampledAnchorSegment(approximateEdgePathSegments(edge, nodes), worldPoint);
    if (!nearestSegment || nearestSegment.distance > worldTolerance) {
      continue;
    }

    if (!closest || nearestSegment.distance < closest.distance) {
      closest = {
        edgeId: edge.id,
        worldPoint,
        insertionIndex: nearestSegment.insertionIndex,
        distance: nearestSegment.distance
      };
    }
  }

  return closest;
}

export function findNearestSegmentInsertionIndex(points: Point[], point: Point): number {
  if (points.length < 2) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const distance = distanceToSegment(point, start, end);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function findNearestSampledAnchorSegment(
  segments: EdgePathSegmentSamples[],
  point: Point
): { insertionIndex: number; distance: number } | null {
  let closest: { insertionIndex: number; distance: number } | null = null;

  for (const segment of segments) {
    const distance = distanceToPolyline(segment.points, point);
    if (!closest || distance < closest.distance) {
      closest = {
        insertionIndex: segment.insertionIndex,
        distance
      };
    }
  }

  return closest;
}

function distanceToPolyline(points: Point[], point: Point): number {
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(point, points[index]!, points[index + 1]!);
    bestDistance = Math.min(bestDistance, distance);
  }

  return bestDistance;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };

  return Math.hypot(point.x - projection.x, point.y - projection.y);
}
