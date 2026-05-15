import type { BoardNode, Point } from "../../domain/board/types";
import { boundsIntersect, type Bounds } from "./bounds";

const HORIZONTAL_GAP = 60;
const VERTICAL_STEP = 88;
const MAX_ATTEMPTS = 16;

export function findLinkedNodePosition(source: BoardNode, nodes: Record<string, BoardNode>): Point {
  const preferredX = source.position.x + source.size.width + HORIZONTAL_GAP;
  const preferredY = source.position.y;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = {
      x: preferredX,
      y: preferredY + getVerticalOffset(attempt)
    };
    const candidateBounds = {
      ...candidate,
      width: source.size.width,
      height: source.size.height
    };

    if (!intersectsAnyNode(candidateBounds, nodes, source.id)) {
      return candidate;
    }
  }

  return { x: preferredX, y: preferredY + VERTICAL_STEP * MAX_ATTEMPTS };
}

function getVerticalOffset(attempt: number): number {
  if (attempt === 0) {
    return 0;
  }

  const step = Math.ceil(attempt / 2) * VERTICAL_STEP;
  return attempt % 2 === 1 ? step : -step;
}

function intersectsAnyNode(candidate: Bounds, nodes: Record<string, BoardNode>, sourceId: string): boolean {
  return Object.values(nodes).some((node) => {
    if (node.id === sourceId) {
      return false;
    }

    return boundsIntersect(candidate, {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height
    });
  });
}
