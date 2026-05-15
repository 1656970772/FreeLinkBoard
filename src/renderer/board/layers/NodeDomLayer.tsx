import { useEffect, useMemo, useRef, useState } from "react";
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
  activeSearchNodeId?: NodeId | null;
  dragPreview?: { nodeIds: NodeId[]; delta: Point } | null;
  nodeGeometryOverrides?: Partial<Record<NodeId, NodeGeometryOverride>>;
  selectedNodeIds?: NodeId[];
  searchMatchNodeIds?: NodeId[];
  onNodeClick?: (nodeId: NodeId) => void;
  onNodeDoubleClick?: (nodeId: NodeId) => void;
  onNodePointerDown?: (nodeId: NodeId, event: PointerEvent<HTMLElement>) => void;
  onNodeResizePointerDown?: (nodeId: NodeId, corner: ResizeCorner, event: PointerEvent<HTMLElement>) => void;
  onTextDraftChange?: (nodeId: NodeId, text: string) => void;
  onTextCommit?: (nodeId: NodeId, text: string) => void;
  onVisibleNodeCountChange?: (count: number) => void;
};

export type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type NodeGeometryOverride = {
  position?: Point;
  size?: Size;
};

const RESIZE_HANDLE_DWELL_MS = 250;
const RESIZE_HANDLE_HOVER_TOLERANCE_PX = 6;

const resizeCorners: Array<{
  corner: ResizeCorner;
  cursor: string;
  position: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}> = [
  { corner: "top-left", cursor: "nwse-resize", position: { left: -7, top: -7 } },
  { corner: "top-right", cursor: "nesw-resize", position: { right: -7, top: -7 } },
  { corner: "bottom-left", cursor: "nesw-resize", position: { bottom: -7, left: -7 } },
  { corner: "bottom-right", cursor: "nwse-resize", position: { bottom: -7, right: -7 } }
];

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
  activeSearchNodeId,
  dragPreview,
  nodeGeometryOverrides,
  nodes,
  onNodeClick,
  onNodeDoubleClick,
  onNodePointerDown,
  onNodeResizePointerDown,
  onTextDraftChange,
  onTextCommit,
  onVisibleNodeCountChange,
  searchMatchNodeIds = [],
  selectedNodeIds = [],
  size,
  viewport
}: NodeDomLayerProps): ReactElement {
  const [resizeHandleNodeId, setResizeHandleNodeId] = useState<NodeId | null>(null);
  const resizeHoverIntentNodeIdRef = useRef<NodeId | null>(null);
  const resizeHoverTimerRef = useRef<number | null>(null);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeIndex = useMemo(() => createNodeSpatialIndex(nodes), [nodes]);
  const visibleNodes = useMemo(
    () => getVisibleNodes(nodes, viewport, size, nodeIndex, nodesById),
    [nodeIndex, nodes, nodesById, size, viewport]
  );

  const clearResizeHoverIntent = (hideHandles = true): void => {
    if (resizeHoverTimerRef.current) {
      window.clearTimeout(resizeHoverTimerRef.current);
      resizeHoverTimerRef.current = null;
    }

    resizeHoverIntentNodeIdRef.current = null;

    if (hideHandles) {
      setResizeHandleNodeId(null);
    }
  };

  const scheduleResizeHandles = (nodeId: NodeId): void => {
    if (resizeHandleNodeId === nodeId) {
      return;
    }

    if (resizeHoverIntentNodeIdRef.current === nodeId && resizeHoverTimerRef.current) {
      return;
    }

    clearResizeHoverIntent(false);
    resizeHoverIntentNodeIdRef.current = nodeId;
    resizeHoverTimerRef.current = window.setTimeout(() => {
      resizeHoverTimerRef.current = null;

      if (resizeHoverIntentNodeIdRef.current === nodeId) {
        setResizeHandleNodeId(nodeId);
      }
    }, RESIZE_HANDLE_DWELL_MS);
  };

  const updateResizeHoverIntent = (
    nodeId: NodeId,
    isSelected: boolean,
    isEditing: boolean,
    event: PointerEvent<HTMLElement>
  ): void => {
    if (!isSelected || isEditing || !isPointerNearBorder(event.currentTarget, event)) {
      if (resizeHandleNodeId === nodeId || resizeHoverIntentNodeIdRef.current === nodeId) {
        clearResizeHoverIntent();
      }
      return;
    }

    scheduleResizeHandles(nodeId);
  };

  useEffect(() => {
    onVisibleNodeCountChange?.(visibleNodes.length);
  }, [onVisibleNodeCountChange, visibleNodes.length]);

  useEffect(
    () => () => {
      if (resizeHoverTimerRef.current) {
        window.clearTimeout(resizeHoverTimerRef.current);
        resizeHoverTimerRef.current = null;
      }

      resizeHoverIntentNodeIdRef.current = null;
    },
    []
  );

  return (
    <div data-testid="node-dom-layer" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {visibleNodes.map((node) => {
        const dragDelta = dragPreview?.nodeIds.includes(node.id) ? dragPreview.delta : null;
        const geometryOverride = nodeGeometryOverrides?.[node.id];
        const basePosition = geometryOverride?.position ?? node.position;
        const position = dragDelta
          ? { x: basePosition.x + dragDelta.x, y: basePosition.y + dragDelta.y }
          : basePosition;
        const screenPoint = worldToScreen(position, viewport);
        const nodeSize = geometryOverride?.size ?? node.size;
        const isEditing = activeEditNodeId === node.id;
        const isSelected = selectedNodeIds.includes(node.id);
        const searchHighlight = activeSearchNodeId === node.id ? "active" : searchMatchNodeIds.includes(node.id) ? "match" : "false";
        const showResizeHandles = isSelected && !isEditing && resizeHandleNodeId === node.id;

        return (
          <article
            data-search-highlight={searchHighlight}
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
            onPointerEnter={(event) => updateResizeHoverIntent(node.id, isSelected, isEditing, event)}
            onPointerLeave={() => {
              if (resizeHandleNodeId === node.id || resizeHoverIntentNodeIdRef.current === node.id) {
                clearResizeHoverIntent();
              }
            }}
            onPointerMove={(event) => updateResizeHoverIntent(node.id, isSelected, isEditing, event)}
            onPointerDown={(event) => {
              event.stopPropagation();
              onNodePointerDown?.(node.id, event);
            }}
            style={{
              background: node.style.backgroundColor,
              border: `1px solid ${searchHighlight === "active" ? "#d14f2f" : isSelected ? "#2f6f6a" : node.style.borderColor}`,
              boxSizing: "border-box",
              boxShadow: searchHighlight === "active"
                ? "0 0 0 4px rgba(209, 79, 47, 0.24), 0 10px 24px rgba(36, 34, 31, 0.14)"
                : searchHighlight === "match"
                  ? "0 0 0 3px rgba(209, 79, 47, 0.14)"
                  : isSelected
                ? "0 0 0 4px rgba(47, 111, 106, 0.22), 0 10px 24px rgba(36, 34, 31, 0.14)"
                : "none",
              color: node.style.textColor,
              height: nodeSize.height,
              left: 0,
              outline: isSelected ? "2px solid #2f6f6a" : "none",
              outlineOffset: 2,
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
                {showResizeHandles
                  ? resizeCorners.map(({ corner, cursor, position }) => (
                      <button
                        aria-label={`Resize node from ${corner}`}
                        data-testid={`board-node-resize-${node.id}-${corner}`}
                        key={corner}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          onNodeResizePointerDown?.(node.id, corner, event);
                        }}
                        style={{
                          ...position,
                          appearance: "none",
                          background: "#2f6f6a",
                          border: "2px solid #fffdf8",
                          borderRadius: 3,
                          boxShadow: "0 2px 8px rgba(36, 34, 31, 0.18)",
                          cursor,
                          display: "block",
                          height: 14,
                          minWidth: 0,
                          padding: 0,
                          pointerEvents: "auto",
                          position: "absolute",
                          width: 14
                        }}
                        title={`Resize from ${corner}`}
                        type="button"
                      />
                    ))
                  : null}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function isPointerNearBorder(element: HTMLElement, event: PointerEvent<HTMLElement>): boolean {
  const rect = element.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const tolerance = RESIZE_HANDLE_HOVER_TOLERANCE_PX;
  const insideExpandedBounds =
    localX >= -tolerance &&
    localY >= -tolerance &&
    localX <= rect.width + tolerance &&
    localY <= rect.height + tolerance;

  if (!insideExpandedBounds) {
    return false;
  }

  return (
    Math.abs(localX) <= tolerance ||
    Math.abs(localY) <= tolerance ||
    Math.abs(rect.width - localX) <= tolerance ||
    Math.abs(rect.height - localY) <= tolerance
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
      className="node-text-editor"
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
        overflow: "auto",
        padding: 0,
        resize: "none",
        width: "100%"
      }}
    />
  );
}
