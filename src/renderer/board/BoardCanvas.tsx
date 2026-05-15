import { nanoid } from "nanoid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactElement, RefObject } from "react";
import {
  CreateEdgeCommand,
  CreateLinkedTextNodeCommand,
  CreateTextNodeCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../application/commands/boardInteractionCommands";
import { boundsIntersect } from "../../application/geometry/bounds";
import type { Bounds } from "../../application/geometry/bounds";
import { findLinkedNodePosition } from "../../application/geometry/linkedNodePlacement";
import { screenToWorld } from "../../application/geometry/viewportTransform";
import type { BoardNode, BoardState, EdgeEndpoint, NodeId, Point, Size } from "../../domain/board/types";
import { useDocumentStore } from "../stores/documentStore";
import { GridCanvasLayer } from "./layers/GridCanvasLayer";
import { EdgeCanvasLayer } from "./layers/EdgeCanvasLayer";
import { InteractionOverlayLayer } from "./layers/InteractionOverlayLayer";
import { NodeDomLayer } from "./layers/NodeDomLayer";
import { useCanvasViewport } from "./useCanvasViewport";

export type BoardCanvasProps = {
  board: BoardState;
  size?: Size;
  className?: string;
  style?: CSSProperties;
};

const defaultSize: Size = { width: 960, height: 640 };
const POINTER_DRAG_THRESHOLD = 4;
const EDGE_CREATION_FOLLOW_UP_MS = 350;
const MIN_NODE_SIZE: Size = { width: 96, height: 44 };

type DragState = {
  nodeIds: NodeId[];
  startScreenPoint: Point;
};

type SelectionBoxState = {
  currentScreenPoint: Point;
  startScreenPoint: Point;
};

type ResizeState = {
  nodeId: NodeId;
  startScreenPoint: Point;
  startSize: Size;
};

type EditingDraft = {
  nodeId: NodeId;
  text: string;
};

type DragPreview = {
  nodeIds: NodeId[];
  delta: Point;
};

type EdgeCreationFollowUp = {
  target: "canvas" | "node";
  targetNodeId?: NodeId;
  until: number;
};

function useMeasuredSize(ref: RefObject<HTMLDivElement | null>, explicitSize?: Size): Size {
  const [measuredSize, setMeasuredSize] = useState(defaultSize);

  useLayoutEffect(() => {
    if (explicitSize) {
      return;
    }

    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateSize = (rect: DOMRectReadOnly): void => {
      const nextSize = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      };

      setMeasuredSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
      );
    };

    updateSize(element.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateSize(entry.contentRect);
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [explicitSize, ref]);

  return explicitSize ?? measuredSize;
}

export function BoardCanvas({ board, className, size, style }: BoardCanvasProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasSize = useMeasuredSize(containerRef, size);
  const { panByScreenDelta, viewport, zoomByScreenPoint } = useCanvasViewport(board.viewport);
  const runBoardCommand = useDocumentStore((state) => state.runBoardCommand);
  const selectNodes = useDocumentStore((state) => state.selectNodes);
  const undoBoardCommand = useDocumentStore((state) => state.undoBoardCommand);
  const redoBoardCommand = useDocumentStore((state) => state.redoBoardCommand);
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(0);
  const [visibleNodeCount, setVisibleNodeCount] = useState(0);
  const [editingNodeId, setEditingNodeId] = useState<NodeId | null>(null);
  const panStartRef = useRef<Point | null>(null);
  const panCaptureRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressNextNodeClickRef = useRef(false);
  const edgeCreationFollowUpRef = useRef<EdgeCreationFollowUp | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const selectionBoxRef = useRef<SelectionBoxState | null>(null);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [linkSourceNodeId, setLinkSourceNodeId] = useState<NodeId | null>(null);
  const nodes = useMemo(() => Object.values(board.nodes), [board.nodes]);
  const edges = useMemo(() => Object.values(board.edges), [board.edges]);
  const nodeSizeOverrides = useMemo((): Partial<Record<NodeId, Size>> | undefined => {
    if (!editingDraft) {
      return undefined;
    }

    const node = board.nodes[editingDraft.nodeId];
    if (!node || node.sizing !== "auto") {
      return undefined;
    }

    return {
      [editingDraft.nodeId]: estimateTextNodeSize(editingDraft.text)
    };
  }, [board.nodes, editingDraft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.code === "Escape") {
        setLinkSourceNodeId(null);
        return;
      }

      if (event.code === "Tab" && !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) {
        if (board.selection.nodeIds.length !== 1) {
          return;
        }

        const sourceNodeId = board.selection.nodeIds[0];
        if (!sourceNodeId) {
          return;
        }

        const sourceNode = sourceNodeId ? board.nodes[sourceNodeId] : undefined;
        if (!sourceNode) {
          return;
        }

        event.preventDefault();
        const nodeId = `node_${nanoid()}`;
        runBoardCommand(
          new CreateLinkedTextNodeCommand({
            clock: new Date().toISOString(),
            edgeId: `edge_${nanoid()}`,
            nodeId,
            position: findLinkedNodePosition(sourceNode, board.nodes),
            sourceNodeId,
            text: ""
          })
        );
        setLinkSourceNodeId(null);
        setEditingNodeId(nodeId);
        setEditingDraft({ nodeId, text: "" });
        return;
      }

      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.code === "KeyL") {
        if (board.selection.nodeIds.length !== 1) {
          return;
        }

        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(board.selection.nodeIds[0] ?? null);
        return;
      }

      if (event.code === "KeyZ") {
        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(null);
        undoBoardCommand();
      }

      if (event.code === "KeyY") {
        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(null);
        redoBoardCommand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [board.nodes, board.selection.nodeIds, redoBoardCommand, runBoardCommand, undoBoardCommand]);

  const createNodeFromBlankDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (isCanvasEdgeCreationFollowUpActive()) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const screenPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const nodeId = `node_${nanoid()}`;
    runBoardCommand(
      new CreateTextNodeCommand({
        clock: new Date().toISOString(),
        id: nodeId,
        position: screenToWorld(screenPoint, viewport),
        text: ""
      })
    );
    setEditingNodeId(nodeId);
    setEditingDraft({ nodeId, text: "" });
  };

  const getLocalScreenPoint = (
    event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>
  ): Point => {
    return getElementLocalScreenPoint(event.currentTarget, event.clientX, event.clientY);
  };

  const beginPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 1 && event.button !== 2) {
      if (event.button === 0) {
        event.currentTarget.setPointerCapture(event.pointerId);
        const startScreenPoint = getLocalScreenPoint(event);
        selectionBoxRef.current = {
          currentScreenPoint: startScreenPoint,
          startScreenPoint
        };
      }
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panCaptureRef.current = event.currentTarget;
    panStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const beginNodeDrag = (nodeId: NodeId, event: PointerEvent<HTMLElement>): void => {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panCaptureRef.current = event.currentTarget;
      panStartRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (isNodeEdgeCreationFollowUpActive(nodeId)) {
      return;
    }

    const selectedNodeIds = board.selection.nodeIds.includes(nodeId) ? board.selection.nodeIds : [nodeId];
    selectNodes(selectedNodeIds);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      nodeIds: selectedNodeIds,
      startScreenPoint: { x: event.clientX, y: event.clientY }
    };
    setDragPreview(null);
  };

  const beginNodeResize = (nodeId: NodeId, event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }

    const node = board.nodes[nodeId];
    if (!node) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStateRef.current = {
      nodeId,
      startScreenPoint: { x: event.clientX, y: event.clientY },
      startSize: node.size
    };
  };

  const updatePointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    const panStart = panStartRef.current;
    if (panStart) {
      const nextPoint = { x: event.clientX, y: event.clientY };
      panByScreenDelta({ x: nextPoint.x - panStart.x, y: nextPoint.y - panStart.y });
      panStartRef.current = nextPoint;
      return;
    }

    const dragState = dragStateRef.current;
    if (dragState) {
      const delta = screenDeltaToWorldDelta(
        {
          x: event.clientX - dragState.startScreenPoint.x,
          y: event.clientY - dragState.startScreenPoint.y
        },
        viewport.zoom
      );
      setDragPreview({ nodeIds: dragState.nodeIds, delta });
      return;
    }

    const selectionState = selectionBoxRef.current;
    if (!selectionState) {
      return;
    }

    const currentScreenPoint = getLocalScreenPoint(event);
    selectionBoxRef.current = {
      ...selectionState,
      currentScreenPoint
    };

    if (screenDistance(selectionState.startScreenPoint, currentScreenPoint) >= POINTER_DRAG_THRESHOLD) {
      setSelectionBox(normalizeBounds(selectionState.startScreenPoint, currentScreenPoint));
    }
  };

  const finishNodeDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    dragStateRef.current = null;
    setDragPreview(null);
    const delta = {
      x: (event.clientX - dragState.startScreenPoint.x) / viewport.zoom,
      y: (event.clientY - dragState.startScreenPoint.y) / viewport.zoom
    };

    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    suppressNextNodeClickRef.current = true;
    runBoardCommand(
      new MoveNodesCommand({
        clock: new Date().toISOString(),
        delta,
        ids: dragState.nodeIds
      })
    );
  };

  const finishNodeResize = (event: PointerEvent<HTMLDivElement>): void => {
    const resizeState = resizeStateRef.current;
    if (!resizeState) {
      return;
    }

    resizeStateRef.current = null;
    const nextSize = {
      width: Math.max(
        MIN_NODE_SIZE.width,
        resizeState.startSize.width + (event.clientX - resizeState.startScreenPoint.x) / viewport.zoom
      ),
      height: Math.max(
        MIN_NODE_SIZE.height,
        resizeState.startSize.height + (event.clientY - resizeState.startScreenPoint.y) / viewport.zoom
      )
    };

    if (nextSize.width === resizeState.startSize.width && nextSize.height === resizeState.startSize.height) {
      return;
    }

    runBoardCommand(
      new ResizeNodeCommand({
        clock: new Date().toISOString(),
        id: resizeState.nodeId,
        size: nextSize
      })
    );
  };

  const endPan = (event: PointerEvent<HTMLDivElement>): void => {
    const panCapture = panCaptureRef.current;
    if (panStartRef.current && panCapture) {
      if (typeof panCapture.hasPointerCapture !== "function" || panCapture.hasPointerCapture(event.pointerId)) {
        panCapture.releasePointerCapture(event.pointerId);
      }
    }
    panStartRef.current = null;
    panCaptureRef.current = null;
  };

  const finishSelectionBox = (event: PointerEvent<HTMLDivElement>): void => {
    const selectionState = selectionBoxRef.current;
    if (!selectionState) {
      return;
    }

    selectionBoxRef.current = null;
    setSelectionBox(null);

    const endScreenPoint = getLocalScreenPoint(event);
    if (screenDistance(selectionState.startScreenPoint, endScreenPoint) < POINTER_DRAG_THRESHOLD) {
      if (linkSourceNodeId) {
        createEdgeFromLinkSource({
          type: "point",
          point: screenToWorld(endScreenPoint, viewport)
        });
        return;
      }

      if (isCanvasEdgeCreationFollowUpActive()) {
        return;
      }

      selectNodes([]);
      return;
    }

    const worldBounds = screenBoundsToWorldBounds(
      normalizeBounds(selectionState.startScreenPoint, endScreenPoint),
      viewport
    );
    const selectedNodeIds = nodes
      .filter((node) => boundsIntersect(nodeBounds(node), worldBounds))
      .map((node) => node.id);

    selectNodes(selectedNodeIds);
  };

  const finishPointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    finishNodeResize(event);
    finishNodeDrag(event);
    finishSelectionBox(event);
    endPan(event);
  };

  const selectNode = (nodeId: NodeId): void => {
    if (suppressNextNodeClickRef.current) {
      suppressNextNodeClickRef.current = false;
      return;
    }

    if (isNodeEdgeCreationFollowUpActive(nodeId)) {
      return;
    }

    if (linkSourceNodeId) {
      createEdgeFromLinkSource({ type: "node", nodeId });
      return;
    }

    selectNodes([nodeId]);
  };

  const createEdgeFromLinkSource = (to: EdgeEndpoint): void => {
    if (!linkSourceNodeId || !board.nodes[linkSourceNodeId]) {
      setLinkSourceNodeId(null);
      return;
    }

    setEditingNodeId(null);
    setEditingDraft(null);
    setLinkSourceNodeId(null);
    markEdgeCreationFollowUp(to);
    runBoardCommand(
      new CreateEdgeCommand({
        clock: new Date().toISOString(),
        edgeId: `edge_${nanoid()}`,
        from: { type: "node", nodeId: linkSourceNodeId },
        to
      })
    );
  };

  const editNode = (nodeId: NodeId): void => {
    if (isNodeEdgeCreationFollowUpActive(nodeId)) {
      return;
    }

    if (linkSourceNodeId) {
      createEdgeFromLinkSource({ type: "node", nodeId });
      return;
    }

    selectNodes([nodeId]);
    setEditingNodeId(nodeId);
    setEditingDraft({ nodeId, text: board.nodes[nodeId]?.text ?? "" });
  };

  const markEdgeCreationFollowUp = (to: EdgeEndpoint): void => {
    const until = getInteractionNow() + EDGE_CREATION_FOLLOW_UP_MS;
    edgeCreationFollowUpRef.current =
      to.type === "node" ? { target: "node", targetNodeId: to.nodeId, until } : { target: "canvas", until };
  };

  const isNodeEdgeCreationFollowUpActive = (nodeId: NodeId): boolean => {
    const followUp = getActiveEdgeCreationFollowUp();
    return followUp?.target === "node" && followUp.targetNodeId === nodeId;
  };

  const isCanvasEdgeCreationFollowUpActive = (): boolean => {
    return getActiveEdgeCreationFollowUp()?.target === "canvas";
  };

  const getActiveEdgeCreationFollowUp = (): EdgeCreationFollowUp | null => {
    const followUp = edgeCreationFollowUpRef.current;
    if (!followUp) {
      return null;
    }

    if (getInteractionNow() > followUp.until) {
      edgeCreationFollowUpRef.current = null;
      return null;
    }

    return followUp;
  };

  const updateNodeTextDraft = (nodeId: NodeId, text: string): void => {
    setEditingDraft({ nodeId, text });
  };

  const commitNodeText = (nodeId: NodeId, text: string): void => {
    setEditingNodeId(null);
    setEditingDraft(null);
    const node = board.nodes[nodeId];
    if (!node || node.text === text) {
      return;
    }

    runBoardCommand(
      new UpdateTextNodeCommand({
        clock: new Date().toISOString(),
        id: nodeId,
        text
      })
    );
  };

  const zoomFromWheel = useCallback((event: globalThis.WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    event.preventDefault();
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomByScreenPoint(getElementLocalScreenPoint(element, event.clientX, event.clientY), zoomFactor);
  }, [zoomByScreenPoint]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    element.addEventListener("wheel", zoomFromWheel, { passive: false });
    return () => element.removeEventListener("wheel", zoomFromWheel);
  }, [zoomFromWheel]);

  return (
    <div
      className={className}
      data-testid="board-canvas"
      ref={containerRef}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={beginPan}
      onPointerMove={updatePointerInteraction}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      onDoubleClick={createNodeFromBlankDoubleClick}
      style={{
        background: "#f3efe7",
        height: size ? size.height : "100%",
        overflow: "hidden",
        position: "relative",
        touchAction: "none",
        width: size ? size.width : "100%",
        ...style
      }}
    >
      <GridCanvasLayer size={canvasSize} viewport={viewport} />
      <EdgeCanvasLayer
        edges={edges}
        nodes={board.nodes}
        onVisibleEdgeCountChange={setVisibleEdgeCount}
        selectedEdgeIds={board.selection.edgeIds}
        size={canvasSize}
        viewport={viewport}
      />
      <NodeDomLayer
        activeEditNodeId={editingNodeId}
        dragPreview={dragPreview}
        nodeSizeOverrides={nodeSizeOverrides ?? {}}
        nodes={nodes}
        onNodeClick={selectNode}
        onNodeDoubleClick={editNode}
        onNodePointerDown={beginNodeDrag}
        onNodeResizePointerDown={beginNodeResize}
        onVisibleNodeCountChange={setVisibleNodeCount}
        onTextDraftChange={updateNodeTextDraft}
        onTextCommit={commitNodeText}
        selectedNodeIds={board.selection.nodeIds}
        size={canvasSize}
        viewport={viewport}
      />
      <InteractionOverlayLayer
        selectionBox={selectionBox}
        viewport={viewport}
        visibleEdgeCount={visibleEdgeCount}
        visibleNodeCount={visibleNodeCount}
      />
    </div>
  );
}

function nodeBounds(node: BoardNode): Bounds {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.size.width,
    height: node.size.height
  };
}

function normalizeBounds(first: Point, second: Point): Bounds {
  return {
    x: Math.min(first.x, second.x),
    y: Math.min(first.y, second.y),
    width: Math.abs(second.x - first.x),
    height: Math.abs(second.y - first.y)
  };
}

function screenBoundsToWorldBounds(bounds: Bounds, viewport: BoardState["viewport"]): Bounds {
  const topLeft = screenToWorld({ x: bounds.x, y: bounds.y }, viewport);
  const bottomRight = screenToWorld(
    {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height
    },
    viewport
  );

  return normalizeBounds(topLeft, bottomRight);
}

function screenDistance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function screenDeltaToWorldDelta(delta: Point, zoom: number): Point {
  return {
    x: delta.x / zoom,
    y: delta.y / zoom
  };
}

function getElementLocalScreenPoint(element: HTMLElement, clientX: number, clientY: number): Point {
  const bounds = element.getBoundingClientRect();

  return {
    x: clientX - bounds.left,
    y: clientY - bounds.top
  };
}

function getInteractionNow(): number {
  return performance.now();
}
