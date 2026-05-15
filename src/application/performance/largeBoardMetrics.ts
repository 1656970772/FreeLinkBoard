import type { BoardNode, BoardState, Size, Viewport } from "../../domain/board/types";
import type { Bounds } from "../geometry/bounds";
import { EdgePathCache } from "../geometry/edgePathCache";
import { SpatialIndex } from "../geometry/SpatialIndex";
import { getVisibleWorldRect } from "../geometry/viewportTransform";

export type LargeBoardMetricsCache = {
  edgePathCache: EdgePathCache;
};

export type LargeBoardMetricsOptions = {
  cache?: LargeBoardMetricsCache;
  screenSize: Size;
  viewport: Viewport;
};

export type LargeBoardMetrics = {
  cache: LargeBoardMetricsCache;
  cacheHits: number;
  cacheMisses: number;
  totalEdges: number;
  totalNodes: number;
  visibleEdges: number;
  visibleNodes: number;
};

export function collectLargeBoardMetrics(
  board: BoardState,
  options: LargeBoardMetricsOptions
): LargeBoardMetrics {
  const visibleWorldRect = getVisibleWorldRect(options.viewport, options.screenSize, 128);
  const nodeIndex = new SpatialIndex();
  const edgeIndex = new SpatialIndex();
  const cache = options.cache ?? { edgePathCache: new EdgePathCache() };
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const node of Object.values(board.nodes)) {
    nodeIndex.upsert(node.id, nodeBounds(node));
  }

  for (const edge of Object.values(board.edges)) {
    const result = cache.edgePathCache.getWithStatus(edge, board.nodes);
    if (result.hit) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
    }
    edgeIndex.upsert(edge.id, result.path.bounds);
  }

  return {
    cache,
    cacheHits,
    cacheMisses,
    totalEdges: Object.keys(board.edges).length,
    totalNodes: Object.keys(board.nodes).length,
    visibleEdges: edgeIndex.query(visibleWorldRect).length,
    visibleNodes: nodeIndex.query(visibleWorldRect).length
  };
}

function nodeBounds(node: BoardNode): Bounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}
