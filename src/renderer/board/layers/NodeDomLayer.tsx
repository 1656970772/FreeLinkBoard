import { useEffect, useMemo, useRef } from "react";
import type { PointerEvent, ReactElement } from "react";
import type { BoardNode, NodeId, Point, Size, Viewport } from "../../../domain/board/types";
import { boundsIntersect } from "../../../application/geometry/bounds";
import { SpatialIndex } from "../../../application/geometry/SpatialIndex";
import { getVisibleWorldRect, worldToScreen } from "../../../application/geometry/viewportTransform";

export type NodeDomLayerProps = {
  nodes: BoardNode[];
  viewport: Viewport;
  size: Size;
  activeEditNodeId?: NodeId | null;
  dragPreview?: { nodeIds: NodeId[]; delta: Point } | null;
  nodeSizeOverrides?: Partial<Record<NodeId, Size>>;
  selectedNodeIds?: NodeId[];
  onNodeClick?: (nodeId: NodeId) => void;
  onNodeDoubleClick?: (nodeId: NodeId) => void;
  onNodePointerDown?: (nodeId: NodeId, event: PointerEvent<HTMLElement>) => void;
  onNodeResizePointerDown?: (nodeId: NodeId, event: PointerEvent<HTMLElement>) => void;
  onTextDraftChange?: (nodeId: NodeId, text: string) => void;
  onTextCommit?: (nodeId: NodeId, text: string) => void;
  onVisibleNodeCountChange?: (count: number) => void;
};

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
  dragPreview,
  nodeSizeOverrides,
  nodes,
  onNodeClick,
  onNodeDoubleClick,
  onNodePointerDown,
  onNodeResizePointerDown,
  onTextDraftChange,
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
        const dragDelta = dragPreview?.nodeIds.includes(node.id) ? dragPreview.delta : null;
        const position = dragDelta
          ? { x: node.position.x + dragDelta.x, y: node.position.y + dragDelta.y }
          : node.position;
        const screenPoint = worldToScreen(position, viewport);
        const nodeSize = nodeSizeOverrides?.[node.id] ?? node.size;
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
              boxSizing: "border-box",
              boxShadow: isSelected ? "0 0 0 2px rgba(47, 111, 106, 0.2)" : "none",
              color: node.style.textColor,
              height: nodeSize.height,
              left: 0,
              overflow: "visible",
              padding: "10px 12px",
              pointerEvents: "auto",
              position: "absolute",
              top: 0,
              transform: `translate(${screenPoint.x}px, ${screenPoint.y}px) scale(${viewport.zoom})`,
              transformOrigin: "top left",
              width: nodeSize.width
            }}
          >
            {isEditing ? (
              <NodeTextEditor node={node} onTextCommit={onTextCommit} onTextDraftChange={onTextDraftChange} />
            ) : (
              <>
                <div
                  data-testid={`board-node-content-${node.id}`}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    overflowWrap: "break-word",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {node.text}
                </div>
                {isSelected ? (
                  <button
                    aria-label="Resize node"
                    data-testid={`board-node-resize-${node.id}`}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onNodeResizePointerDown?.(node.id, event);
                    }}
                    style={{
                      appearance: "none",
                      background: "#2f6f6a",
                      border: "2px solid #fffdf8",
                      borderRadius: 3,
                      bottom: -7,
                      cursor: "nwse-resize",
                      display: "block",
                      height: 14,
                      minWidth: 0,
                      padding: 0,
                      pointerEvents: "auto",
                      position: "absolute",
                      right: -7,
                      width: 14
                    }}
                    type="button"
                  />
                ) : null}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

type NodeTextEditorProps = {
  node: BoardNode;
  onTextDraftChange: ((nodeId: NodeId, text: string) => void) | undefined;
  onTextCommit: ((nodeId: NodeId, text: string) => void) | undefined;
};

function NodeTextEditor({ node, onTextCommit, onTextDraftChange }: NodeTextEditorProps): ReactElement {
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
      onChange={(event) => onTextDraftChange?.(node.id, event.currentTarget.value)}
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
