import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import type { BoardEdge, BoardNode, Point, Size, Viewport } from "../../../domain/board/types";
import { EdgePathCache, type EdgePath } from "../../../application/geometry/edgePathCache";
import { SpatialIndex } from "../../../application/geometry/SpatialIndex";
import { getVisibleWorldRect, worldToScreen } from "../../../application/geometry/viewportTransform";

export type EdgeCanvasLayerProps = {
  edges: BoardEdge[];
  nodes: Record<string, BoardNode>;
  viewport: Viewport;
  selectedEdgeIds?: string[];
  size: Size;
  onVisibleEdgeCountChange?: (count: number) => void;
};

type IndexedEdgePaths = {
  index: SpatialIndex;
  edgesById: Map<string, BoardEdge>;
  pathsByEdgeId: Map<string, EdgePath>;
};

function createIndexedEdgePaths(
  edges: BoardEdge[],
  nodes: Record<string, BoardNode>,
  cache: EdgePathCache
): IndexedEdgePaths {
  const index = new SpatialIndex();
  const edgesById = new Map<string, BoardEdge>();
  const pathsByEdgeId = new Map<string, EdgePath>();

  for (const edge of edges) {
    const path = cache.get(edge, nodes);
    index.upsert(edge.id, path.bounds);
    edgesById.set(edge.id, edge);
    pathsByEdgeId.set(edge.id, path);
  }

  return { index, edgesById, pathsByEdgeId };
}

export function EdgeCanvasLayer({
  edges,
  nodes,
  onVisibleEdgeCountChange,
  selectedEdgeIds = [],
  size,
  viewport
}: EdgeCanvasLayerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cache = useMemo(() => new EdgePathCache(), []);
  const indexedEdgePaths = useMemo(() => createIndexedEdgePaths(edges, nodes, cache), [cache, edges, nodes]);
  const selectedEdgeIdSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const visibleWorldRect = getVisibleWorldRect(viewport, size, 128);
    const visiblePaths = indexedEdgePaths.index
      .query(visibleWorldRect)
      .map((id) => ({
        edge: indexedEdgePaths.edgesById.get(id),
        path: indexedEdgePaths.pathsByEdgeId.get(id)
      }))
      .filter((entry): entry is { edge: BoardEdge; path: EdgePath } => Boolean(entry.edge && entry.path));

    onVisibleEdgeCountChange?.(visiblePaths.length);

    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, size.width, size.height);

    for (const { edge, path } of visiblePaths) {
      const points = path.points;
      if (points.length < 2) {
        continue;
      }

      context.beginPath();
      const firstPoint = points[0];
      if (!firstPoint) {
        continue;
      }

      drawEdgePath(context, edge, points, viewport);

      const isSelected = selectedEdgeIdSet.has(edge.id);
      const lineWidth = edge.stroke.width + (isSelected ? 2 : 0);
      context.strokeStyle = edge.stroke.color;
      context.lineWidth = lineWidth;
      context.setLineDash(edge.stroke.dash === "dashed" ? [8, 8] : []);
      context.stroke();
      drawArrowHeads(context, edge, points, viewport, lineWidth);
    }

    context.restore();
  }, [indexedEdgePaths, onVisibleEdgeCountChange, selectedEdgeIdSet, size.height, size.width, viewport]);

  return (
    <canvas
      aria-hidden="true"
      data-testid="edge-canvas-layer"
      ref={canvasRef}
      style={{ inset: 0, position: "absolute" }}
    />
  );
}

function drawEdgePath(
  context: CanvasRenderingContext2D,
  edge: BoardEdge,
  points: Point[],
  viewport: Viewport
): void {
  const screenPoints = points.map((point) => worldToScreen(point, viewport));
  const first = screenPoints[0];

  if (!first) {
    return;
  }

  context.moveTo(first.x, first.y);

  if (edge.pathType !== "roundedElbow" || screenPoints.length < 3) {
    for (const point of screenPoints.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    return;
  }

  for (let index = 1; index < screenPoints.length - 1; index += 1) {
    const previous = screenPoints[index - 1]!;
    const corner = screenPoints[index]!;
    const next = screenPoints[index + 1]!;
    const radius = Math.min(16, distance(previous, corner) / 2, distance(corner, next) / 2);

    if (radius <= 0) {
      context.lineTo(corner.x, corner.y);
      continue;
    }

    const cornerStart = pointToward(corner, previous, radius);
    const cornerEnd = pointToward(corner, next, radius);

    context.lineTo(cornerStart.x, cornerStart.y);
    context.quadraticCurveTo(corner.x, corner.y, cornerEnd.x, cornerEnd.y);
  }

  const last = screenPoints[screenPoints.length - 1]!;
  context.lineTo(last.x, last.y);
}

function drawArrowHeads(
  context: CanvasRenderingContext2D,
  edge: BoardEdge,
  points: Point[],
  viewport: Viewport,
  lineWidth: number
): void {
  if (edge.arrow === "none" || points.length < 2) {
    return;
  }

  const firstPoint = points[0]!;
  const secondPoint = points[1]!;
  const penultimatePoint = points[points.length - 2]!;
  const lastPoint = points[points.length - 1]!;

  context.setLineDash([]);

  if (edge.arrow === "both") {
    drawArrowHead(
      context,
      worldToScreen(firstPoint, viewport),
      worldToScreen(secondPoint, viewport),
      lineWidth,
      edge.stroke.color
    );
  }

  drawArrowHead(
    context,
    worldToScreen(lastPoint, viewport),
    worldToScreen(penultimatePoint, viewport),
    lineWidth,
    edge.stroke.color
  );
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  tip: Point,
  tail: Point,
  lineWidth: number,
  fillColor: string
): void {
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const size = Math.max(10, lineWidth * 3);
  const spread = Math.PI / 6;
  const left = {
    x: tip.x - Math.cos(angle - spread) * size,
    y: tip.y - Math.sin(angle - spread) * size
  };
  const right = {
    x: tip.x - Math.cos(angle + spread) * size,
    y: tip.y - Math.sin(angle + spread) * size
  };

  context.fillStyle = fillColor;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(left.x, left.y);
  context.lineTo(right.x, right.y);
  context.closePath?.();
  context.fill?.();
}

function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointToward(from: Point, to: Point, amount: number): Point {
  const segmentLength = distance(from, to);

  if (segmentLength === 0) {
    return from;
  }

  const ratio = amount / segmentLength;

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
}
