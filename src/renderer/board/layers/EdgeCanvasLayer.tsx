import { useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import type { BoardEdge, BoardNode, Size, Viewport } from "../../../domain/board/types";
import { EdgePathCache, type EdgePath } from "../../../application/geometry/edgePathCache";
import { SpatialIndex } from "../../../application/geometry/SpatialIndex";
import { getVisibleWorldRect, worldToScreen } from "../../../application/geometry/viewportTransform";

export type EdgeCanvasLayerProps = {
  edges: BoardEdge[];
  nodes: Record<string, BoardNode>;
  viewport: Viewport;
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
  size,
  viewport
}: EdgeCanvasLayerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cache = useMemo(() => new EdgePathCache(), []);
  const indexedEdgePaths = useMemo(() => createIndexedEdgePaths(edges, nodes, cache), [cache, edges, nodes]);

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

      const first = worldToScreen(firstPoint, viewport);
      context.moveTo(first.x, first.y);

      for (const point of points.slice(1)) {
        const screenPoint = worldToScreen(point, viewport);
        context.lineTo(screenPoint.x, screenPoint.y);
      }

      context.strokeStyle = edge.stroke.color;
      context.lineWidth = edge.stroke.width;
      context.setLineDash(edge.stroke.dash === "dashed" ? [8, 8] : []);
      context.stroke();
    }

    context.restore();
  }, [indexedEdgePaths, onVisibleEdgeCountChange, size.height, size.width, viewport]);

  return (
    <canvas
      aria-hidden="true"
      data-testid="edge-canvas-layer"
      ref={canvasRef}
      style={{ inset: 0, position: "absolute" }}
    />
  );
}
