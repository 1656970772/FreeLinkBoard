import { useEffect, useMemo, useRef } from "react";
import type { PointerEvent, ReactElement } from "react";
import type { BoardNode, NodeId, Size, Viewport } from "../../../domain/board/types";
import { boundsIntersect } from "../../../application/geometry/bounds";
import { SpatialIndex } from "../../../application/geometry/SpatialIndex";
import { getVisibleWorldRect, worldToScreen } from "../../../application/geometry/viewportTransform";

export type NodeDomLayerProps = {
  nodes: BoardNode[];
  viewport: Viewport;
  size: Size;
  activeEditNodeId?: NodeId | null;
  selectedNodeIds?: NodeId[];
  onNodeClick?: (nodeId: NodeId) => void;
  onNodeDoubleClick?: (nodeId: NodeId) => void;
  onNodePointerDown?: (nodeId: NodeId, event: PointerEvent<HTMLElement>) => void;
  onTextCommit?: (nodeId: NodeId, text: string) => void;
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
  activeEditNodeId,
  nodes,
  onNodeClick,
  onNodeDoubleClick,
  onNodePointerDown,
  onTextCommit,
  onVisibleNodeCountChange,
  selectedNodeIds = [],
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
        const isEditing = activeEditNodeId === node.id;
        const isSelected = selectedNodeIds.includes(node.id);

        return (
          <article
            data-selected={isSelected ? "true" : "false"}
            data-testid={`board-node-${node.id}`}
            key={node.id}
            onClick={(event) => {
              event.stopPropagation();
              onNodeClick?.(node.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onNodeDoubleClick?.(node.id);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onNodePointerDown?.(node.id, event);
            }}
            style={{
              background: node.style.backgroundColor,
              border: `1px solid ${isSelected ? "#2f6f6a" : node.style.borderColor}`,
              boxShadow: isSelected ? "0 0 0 2px rgba(47, 111, 106, 0.2)" : "none",
              color: node.style.textColor,
              height: node.size.height,
              left: 0,
              overflow: "hidden",
              padding: "10px 12px",
              pointerEvents: "auto",
              position: "absolute",
              top: 0,
              transform: `translate(${screenPoint.x}px, ${screenPoint.y}px) scale(${viewport.zoom})`,
              transformOrigin: "top left",
              width: node.size.width
            }}
          >
            {isEditing ? (
              <NodeTextEditor node={node} onTextCommit={onTextCommit} />
            ) : (
              <div
                data-testid={`board-node-content-${node.id}`}
                style={{
                  fontSize: isLowDetail ? 12 : 14,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  overflowWrap: "break-word",
                  whiteSpace: isLowDetail ? "nowrap" : "pre-wrap"
                }}
              >
                {isLowDetail ? simplifyText(node.text) : node.text}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

type NodeTextEditorProps = {
  node: BoardNode;
  onTextCommit: ((nodeId: NodeId, text: string) => void) | undefined;
};

function NodeTextEditor({ node, onTextCommit }: NodeTextEditorProps): ReactElement {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
    textAreaRef.current?.select();
  }, []);

  return (
    <textarea
      aria-label="Node text"
      defaultValue={node.text}
      onBlur={(event) => onTextCommit?.(node.id, event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.blur();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={textAreaRef}
      style={{
        background: "transparent",
        border: 0,
        color: "inherit",
        font: "inherit",
        fontSize: 14,
        fontWeight: 600,
        height: "100%",
        lineHeight: 1.25,
        margin: 0,
        outline: "none",
        padding: 0,
        resize: "none",
        width: "100%"
      }}
    />
  );
}
