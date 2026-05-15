import type { BoardEdge, BoardNode, Point, Viewport } from "../../domain/board/types";
import { resolveEdgeEndpoint } from "./edgePathCache";
import { screenToWorld } from "./viewportTransform";

export type EdgeHit = {
  edgeId: string;
  worldPoint: Point;
  insertionIndex: number;
  distance: number;
};

const BEZIER_SAMPLES = 12;

export function approximateEdgePathPoints(edge: BoardEdge, nodes: Record<string, BoardNode>): Point[] {
  const anchors = [resolveEdgeEndpoint(edge.from, nodes), ...edge.fixedPoints, resolveEdgeEndpoint(edge.to, nodes)];

  if (edge.pathType === "straight") {
    return anchors;
  }

  if (edge.pathType === "roundedElbow") {
    return createRoundedElbowPolyline(anchors);
  }

  return sampleBezierPolyline(anchors);
}

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
    const points = approximateEdgePathPoints(edge, nodes);
    const distance = distanceToPolyline(points, worldPoint);
    if (distance > worldTolerance) {
      continue;
    }

    if (!closest || distance < closest.distance) {
      closest = {
        edgeId: edge.id,
        worldPoint,
        insertionIndex: findNearestSegmentInsertionIndex(points, worldPoint),
        distance
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

function createRoundedElbowPolyline(anchors: Point[]): Point[] {
  const result: Point[] = [];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const midX = start.x + (end.x - start.x) / 2;

    if (index === 0) {
      result.push(start);
    }

    result.push({ x: midX, y: start.y }, { x: midX, y: end.y }, end);
  }

  return result;
}

function sampleBezierPolyline(anchors: Point[]): Point[] {
  const result: Point[] = [];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const distance = Math.max(40, Math.abs(end.x - start.x) * 0.45);
    const controlA = { x: start.x + distance, y: start.y };
    const controlB = { x: end.x - distance, y: end.y };

    for (let sample = 0; sample <= BEZIER_SAMPLES; sample += 1) {
      if (index > 0 && sample === 0) {
        continue;
      }

      result.push(cubicPoint(start, controlA, controlB, end, sample / BEZIER_SAMPLES));
    }
  }

  return result;
}

function cubicPoint(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const mt = 1 - t;

  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * controlA.x + 3 * mt * t ** 2 * controlB.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * controlA.y + 3 * mt * t ** 2 * controlB.y + t ** 3 * end.y
  };
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
