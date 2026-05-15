import { nanoid } from "nanoid";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactElement, RefObject, WheelEvent } from "react";
import {
  CreateTextNodeCommand,
  MoveNodesCommand,
  UpdateTextNodeCommand
} from "../../application/commands/boardInteractionCommands";
import { screenToWorld } from "../../application/geometry/viewportTransform";
import type { BoardState, NodeId, Point, Size } from "../../domain/board/types";
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

type DragState = {
  nodeIds: NodeId[];
  startScreenPoint: Point;
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
  const { panByScreenDelta, viewport, zoomAtScreenPoint } = useCanvasViewport(board.viewport);
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
  const nodes = useMemo(() => Object.values(board.nodes), [board.nodes]);
  const edges = useMemo(() => Object.values(board.edges), [board.edges]);

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

      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      if (event.code === "KeyZ") {
        event.preventDefault();
        setEditingNodeId(null);
        undoBoardCommand();
      }

      if (event.code === "KeyY") {
        event.preventDefault();
        setEditingNodeId(null);
        redoBoardCommand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoBoardCommand, undoBoardCommand]);

  const createNodeFromBlankDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
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
  };

  const beginPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 1 && event.button !== 2) {
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

    const selectedNodeIds = board.selection.nodeIds.includes(nodeId) ? board.selection.nodeIds : [nodeId];
    selectNodes(selectedNodeIds);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      nodeIds: selectedNodeIds,
      startScreenPoint: { x: event.clientX, y: event.clientY }
    };
  };

  const updatePan = (event: PointerEvent<HTMLDivElement>): void => {
    const panStart = panStartRef.current;
    if (!panStart) {
      return;
    }

    const nextPoint = { x: event.clientX, y: event.clientY };
    panByScreenDelta({ x: nextPoint.x - panStart.x, y: nextPoint.y - panStart.y });
    panStartRef.current = nextPoint;
  };

  const finishNodeDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    dragStateRef.current = null;
    const delta = {
      x: (event.clientX - dragState.startScreenPoint.x) / viewport.zoom,
      y: (event.clientY - dragState.startScreenPoint.y) / viewport.zoom
    };

    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    runBoardCommand(
      new MoveNodesCommand({
        clock: new Date().toISOString(),
        delta,
        ids: dragState.nodeIds
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

  const finishPointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    finishNodeDrag(event);
    endPan(event);
  };

  const selectNode = (nodeId: NodeId): void => {
    selectNodes([nodeId]);
  };

  const editNode = (nodeId: NodeId): void => {
    selectNodes([nodeId]);
    setEditingNodeId(nodeId);
  };

  const commitNodeText = (nodeId: NodeId, text: string): void => {
    setEditingNodeId(null);
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

  const zoomFromWheel = (event: WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomAtScreenPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, viewport.zoom * zoomFactor);
  };

  return (
    <div
      className={className}
      data-testid="board-canvas"
      ref={containerRef}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={beginPan}
      onPointerMove={updatePan}
      onPointerUp={finishPointerInteraction}
      onPointerCancel={finishPointerInteraction}
      onDoubleClick={createNodeFromBlankDoubleClick}
      onWheel={zoomFromWheel}
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
        size={canvasSize}
        viewport={viewport}
      />
      <NodeDomLayer
        activeEditNodeId={editingNodeId}
        nodes={nodes}
        onNodeClick={selectNode}
        onNodeDoubleClick={editNode}
        onNodePointerDown={beginNodeDrag}
        onVisibleNodeCountChange={setVisibleNodeCount}
        onTextCommit={commitNodeText}
        selectedNodeIds={board.selection.nodeIds}
        size={canvasSize}
        viewport={viewport}
      />
      <InteractionOverlayLayer
        viewport={viewport}
        visibleEdgeCount={visibleEdgeCount}
        visibleNodeCount={visibleNodeCount}
      />
    </div>
  );
}
