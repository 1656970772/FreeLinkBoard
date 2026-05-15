import type { BoardEdge, BoardNode, EdgeEndpoint, Point } from "../../domain/board/types";

export type EdgePathSegmentSamples = {
  insertionIndex: number;
  points: Point[];
};

const BEZIER_SAMPLES = 12;

export function resolveEdgeEndpoint(endpoint: EdgeEndpoint, nodes: Record<string, BoardNode>): Point | null {
  if (endpoint.type === "point") {
    return endpoint.point;
  }

  const node = nodes[endpoint.nodeId];
  if (!node) {
    return null;
  }

  return {
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2
  };
}

export function approximateEdgePathPoints(edge: BoardEdge, nodes: Record<string, BoardNode>): Point[] {
  return approximateEdgePathSegments(edge, nodes).flatMap((segment, index) =>
    index === 0 ? segment.points : segment.points.slice(1)
  );
}

export function approximateEdgePathSegments(edge: BoardEdge, nodes: Record<string, BoardNode>): EdgePathSegmentSamples[] {
  const anchors = resolveEdgeAnchors(edge, nodes);

  if (!anchors) {
    return [];
  }

  if (edge.pathType === "straight") {
    return createStraightSegments(anchors);
  }

  if (edge.pathType === "roundedElbow") {
    return createRoundedElbowSegments(anchors);
  }

  return sampleBezierSegments(anchors);
}

function resolveEdgeAnchors(edge: BoardEdge, nodes: Record<string, BoardNode>): Point[] | null {
  const from = resolveEdgeEndpoint(edge.from, nodes);
  const to = resolveEdgeEndpoint(edge.to, nodes);

  if (!from || !to) {
    return null;
  }

  return [from, ...edge.fixedPoints, to];
}

function createStraightSegments(anchors: Point[]): EdgePathSegmentSamples[] {
  return anchors.slice(0, -1).map((start, index) => ({
    insertionIndex: index,
    points: [start, anchors[index + 1]!]
  }));
}

function createRoundedElbowSegments(anchors: Point[]): EdgePathSegmentSamples[] {
  const result: EdgePathSegmentSamples[] = [];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const midX = start.x + (end.x - start.x) / 2;

    result.push({
      insertionIndex: index,
      points: [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]
    });
  }

  return result;
}

function sampleBezierSegments(anchors: Point[]): EdgePathSegmentSamples[] {
  const result: EdgePathSegmentSamples[] = [];

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const distance = Math.max(40, Math.abs(end.x - start.x) * 0.45);
    const controlA = { x: start.x + distance, y: start.y };
    const controlB = { x: end.x - distance, y: end.y };
    const points: Point[] = [];

    for (let sample = 0; sample <= BEZIER_SAMPLES; sample += 1) {
      points.push(cubicPoint(start, controlA, controlB, end, sample / BEZIER_SAMPLES));
    }

    result.push({ insertionIndex: index, points });
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
