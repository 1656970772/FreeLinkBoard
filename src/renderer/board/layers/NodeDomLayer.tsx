import { useEffect, useMemo } from "react";
import type { ReactElement } from "react";
import type { BoardNode, Size, Viewport } from "../../../domain/board/types";
import { boundsIntersect } from "../../../application/geometry/bounds";
import { SpatialIndex } from "../../../application/geometry/SpatialIndex";
import { getVisibleWorldRect, worldToScreen } from "../../../application/geometry/viewportTransform";

export type NodeDomLayerProps = {
  nodes: BoardNode[];
  viewport: Viewport;
  size: Size;
  onVisibleNodeCountChange?: (count: number) => void;
};

const simplifyText = (text: string): string => text.trim().split(/\s+/).slice(0, 2).join(" ");

function nodeBounds(node: BoardNode) {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}

export function createNodeSpatialIndex(nodes: BoardNode[]): SpatialIndex {
  const index = new SpatialIndex();

  for (const node of nodes) {
    index.upsert(node.id, nodeBounds(node));
  }

  return index;
}

export function getVisibleNodes(
  nodes: BoardNode[],
  viewport: Viewport,
  size: Size,
  spatialIndex?: SpatialIndex,
  nodesById?: Map<string, BoardNode>
): BoardNode[] {
  const visibleWorldRect = getVisibleWorldRect(viewport, size, 128);

  if (spatialIndex) {
    const lookup = nodesById ?? new Map(nodes.map((node) => [node.id, node]));

    return spatialIndex
      .query(visibleWorldRect)
      .map((id) => lookup.get(id))
      .filter((node): node is BoardNode => Boolean(node));
  }

  return nodes.filter((node) =>
    boundsIntersect(nodeBounds(node), visibleWorldRect)
  );
}

export function NodeDomLayer({
  nodes,
  onVisibleNodeCountChange,
  size,
  viewport
}: NodeDomLayerProps): ReactElement {
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeIndex = useMemo(() => createNodeSpatialIndex(nodes), [nodes]);
  const visibleNodes = useMemo(
    () => getVisibleNodes(nodes, viewport, size, nodeIndex, nodesById),
    [nodeIndex, nodes, nodesById, size, viewport]
  );

  useEffect(() => {
    onVisibleNodeCountChange?.(visibleNodes.length);
  }, [onVisibleNodeCountChange, visibleNodes.length]);

  return (
    <div data-testid="node-dom-layer" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {visibleNodes.map((node) => {
        const screenPoint = worldToScreen(node.position, viewport);
        const isLowDetail = viewport.zoom < 0.35;

        return (
          <article
            data-testid={`board-node-${node.id}`}
            key={node.id}
            style={{
              background: node.style.backgroundColor,
              border: `1px solid ${node.style.borderColor}`,
              color: node.style.textColor,
              height: node.size.height,
              left: 0,
              overflow: "hidden",
              padding: "10px 12px",
              position: "absolute",
              top: 0,
              transform: `translate(${screenPoint.x}px, ${screenPoint.y}px) scale(${viewport.zoom})`,
              transformOrigin: "top left",
              width: node.size.width
            }}
          >
            <div
              style={{
                fontSize: isLowDetail ? 12 : 14,
                fontWeight: 600,
                lineHeight: 1.25,
                whiteSpace: "nowrap"
              }}
            >
              {isLowDetail ? simplifyText(node.text) : node.text}
            </div>
          </article>
        );
      })}
    </div>
  );
}
