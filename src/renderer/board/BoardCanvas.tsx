import { nanoid } from "nanoid";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactElement, RefObject } from "react";
import {
  CreateEdgeCommand,
  CreateLinkedTextNodeCommand,
  CreateTextNodeCommand,
  InsertEdgeFixedPointCommand,
  MoveEdgeFixedPointCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  UpdateEdgeStyleCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../application/commands/boardInteractionCommands";
import { boundsIntersect } from "../../application/geometry/bounds";
import type { Bounds } from "../../application/geometry/bounds";
import { hitTestEdges } from "../../application/geometry/edgeHitTesting";
import { findLinkedNodePosition } from "../../application/geometry/linkedNodePlacement";
import { screenToWorld } from "../../application/geometry/viewportTransform";
import { defaultBoardSettings } from "../../domain/board/defaults";
import type { BoardEdge, BoardNode, BoardState, EdgeEndpoint, NodeId, Point, Size } from "../../domain/board/types";
import { useDocumentStore } from "../stores/documentStore";
import { GridCanvasLayer } from "./layers/GridCanvasLayer";
import { EdgeControlLayer, type EdgeStylePatch } from "./layers/EdgeControlLayer";
import { EdgeCanvasLayer } from "./layers/EdgeCanvasLayer";
import { InteractionOverlayLayer } from "./layers/InteractionOverlayLayer";
import { NodeDomLayer, type ResizeCorner } from "./layers/NodeDomLayer";
import { useCanvasViewport } from "./useCanvasViewport";
import { useSearchStore } from "../stores/searchStore";
import { useSettingsStore } from "../stores/settingsStore";

export type BoardCanvasProps = {
  activeSearchNodeId?: NodeId | null;
  board: BoardState;
  size?: Size;
  className?: string;
  searchMatchNodeIds?: NodeId[];
  style?: CSSProperties;
};

const defaultSize: Size = { width: 960, height: 640 };
const POINTER_DRAG_THRESHOLD = 4;
const EDGE_CREATION_FOLLOW_UP_MS = 350;
const MIN_NODE_SIZE: Size = { width: 96, height: 44 };
const LINK_PREVIEW_EDGE_ID = "__link-preview-edge";

type DragState = {
  nodeIds: NodeId[];
  startScreenPoint: Point;
};

type SelectionBoxState = {
  currentScreenPoint: Point;
  startScreenPoint: Point;
};

type ResizeState = {
  corner: ResizeCorner;
  nodeId: NodeId;
  startPosition: Point;
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

type ResizePreview = {
  nodeId: NodeId;
  position: Point;
  size: Size;
};

type NodeGeometryOverride = {
  position?: Point;
  size?: Size;
};

type FixedPointDragState = {
  edgeId: string;
  index: number;
  startPoint: Point;
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

export function BoardCanvas({
  activeSearchNodeId,
  board,
  className,
  searchMatchNodeIds = [],
  size,
  style
}: BoardCanvasProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasSize = useMeasuredSize(containerRef, size);
  const { panByScreenDelta, setViewport, viewport, zoomByScreenPoint } = useCanvasViewport(board.viewport);
  const runBoardCommand = useDocumentStore((state) => state.runBoardCommand);
  const selectNodes = useDocumentStore((state) => state.selectNodes);
  const selectEdges = useDocumentStore((state) => state.selectEdges);
  const undoBoardCommand = useDocumentStore((state) => state.undoBoardCommand);
  const redoBoardCommand = useDocumentStore((state) => state.redoBoardCommand);
  const copySelection = useDocumentStore((state) => state.copySelection);
  const deleteSelection = useDocumentStore((state) => state.deleteSelection);
  const pasteClipboard = useDocumentStore((state) => state.pasteClipboard);
  const saveCurrentBoardNow = useDocumentStore((state) => state.saveCurrentBoardNow);
  const openSearch = useSearchStore((state) => state.openSearch);
  const defaultEdgeStyle = useSettingsStore((state) => state.settings.defaultEdgeStyle);
  const wheelZoomMode = useSettingsStore((state) => state.settings.wheelZoomMode);
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
  const fixedPointDragStateRef = useRef<FixedPointDragState | null>(null);
  const latestPointerWorldPointRef = useRef<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [editingDraft, setEditingDraft] = useState<EditingDraft | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const [linkSourceNodeId, setLinkSourceNodeId] = useState<NodeId | null>(null);
  const [linkPreviewPoint, setLinkPreviewPoint] = useState<Point | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const nodes = useMemo(() => Object.values(board.nodes), [board.nodes]);
  const edges = useMemo(() => Object.values(board.edges), [board.edges]);
  const previewEdges = useMemo(() => {
    const sourceNodeId = linkSourceNodeId;
    if (!sourceNodeId || !linkPreviewPoint || !board.nodes[sourceNodeId]) {
      return edges;
    }

    return [...edges, createLinkPreviewEdge(sourceNodeId, linkPreviewPoint, defaultEdgeStyle)];
  }, [board.nodes, defaultEdgeStyle, edges, linkPreviewPoint, linkSourceNodeId]);
  const selectedEdge = useMemo((): BoardEdge | null => {
    if (board.selection.edgeIds.length !== 1) {
      return null;
    }

    return board.edges[board.selection.edgeIds[0]!] ?? null;
  }, [board.edges, board.selection.edgeIds]);
  const controlEdge = useMemo((): BoardEdge | null => {
    if (selectedEdge) {
      return selectedEdge;
    }

    return hoveredEdgeId ? board.edges[hoveredEdgeId] ?? null : null;
  }, [board.edges, hoveredEdgeId, selectedEdge]);
  const nodeGeometryOverrides = useMemo((): Partial<Record<NodeId, NodeGeometryOverride>> => {
    const overrides: Partial<Record<NodeId, NodeGeometryOverride>> = {};

    if (editingDraft) {
      const node = board.nodes[editingDraft.nodeId];
      if (node?.sizing === "auto") {
        overrides[editingDraft.nodeId] = {
          ...overrides[editingDraft.nodeId],
          size: estimateTextNodeSize(editingDraft.text)
        };
      }
    }

    if (resizePreview) {
      overrides[resizePreview.nodeId] = {
        ...overrides[resizePreview.nodeId],
        position: resizePreview.position,
        size: resizePreview.size
      };
    }

    return overrides;
  }, [board.nodes, editingDraft, resizePreview]);
  const previewNodesById = useMemo(
    () => applyNodePreviews(board.nodes, nodeGeometryOverrides, dragPreview),
    [board.nodes, dragPreview, nodeGeometryOverrides]
  );

  useEffect(() => {
    if (!activeSearchNodeId) {
      return;
    }

    const node = board.nodes[activeSearchNodeId];
    if (!node) {
      return;
    }

    setViewport((current) => ({
      ...current,
      x: node.position.x + node.size.width / 2 - canvasSize.width / (2 * current.zoom),
      y: node.position.y + node.size.height / 2 - canvasSize.height / (2 * current.zoom)
    }));
  }, [activeSearchNodeId, board.nodes, canvasSize.height, canvasSize.width, setViewport]);

  const createLinkedEditableTextNode = useCallback(
    (sourceNodeId: NodeId): boolean => {
      const sourceNode = board.nodes[sourceNodeId];
      if (!sourceNode) {
        return false;
      }

      const clock = new Date().toISOString();

      if (editingDraft?.nodeId === sourceNodeId && sourceNode.text !== editingDraft.text) {
        runBoardCommand(
          new UpdateTextNodeCommand({
            clock,
            id: sourceNodeId,
            text: editingDraft.text
          })
        );
      }

      const placementSource =
        editingDraft?.nodeId === sourceNodeId && sourceNode.sizing === "auto"
          ? { ...sourceNode, size: estimateTextNodeSize(editingDraft.text), text: editingDraft.text }
          : sourceNode;
      const placementNodes =
        placementSource === sourceNode ? board.nodes : { ...board.nodes, [sourceNodeId]: placementSource };
      const nodeId = `node_${nanoid()}`;
      runBoardCommand(
        new CreateLinkedTextNodeCommand({
          clock,
          edgeStyle: defaultEdgeStyle,
          edgeId: `edge_${nanoid()}`,
          nodeId,
          position: findLinkedNodePosition(placementSource, placementNodes),
          sourceNodeId,
          text: ""
        })
      );
      setLinkSourceNodeId(null);
      setLinkPreviewPoint(null);
      setEditingNodeId(nodeId);
      setEditingDraft({ nodeId, text: "" });
      return true;
    },
    [board.nodes, defaultEdgeStyle, editingDraft, runBoardCommand]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const isPlainTab = event.code === "Tab" && !(event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
      const hasCommandModifier = event.ctrlKey || event.metaKey;

      if (hasCommandModifier && event.code === "KeyF") {
        event.preventDefault();
        openSearch();
        return;
      }

      if (hasCommandModifier && event.code === "KeyS") {
        event.preventDefault();
        if (editingDraft?.nodeId) {
          const node = board.nodes[editingDraft.nodeId];
          if (node && node.text !== editingDraft.text) {
            runBoardCommand(
              new UpdateTextNodeCommand({
                clock: new Date().toISOString(),
                id: editingDraft.nodeId,
                text: editingDraft.text
              })
            );
          }
          setEditingNodeId(null);
          setEditingDraft(null);
        }
        void saveCurrentBoardNow();
        return;
      }

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        if (target instanceof HTMLTextAreaElement && isPlainTab && editingNodeId) {
          if (createLinkedEditableTextNode(editingNodeId)) {
            event.preventDefault();
          }
        }
        return;
      }

      if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if (event.code === "Escape") {
        setLinkSourceNodeId(null);
        setLinkPreviewPoint(null);
        return;
      }

      if (isPlainTab) {
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
        createLinkedEditableTextNode(sourceNodeId);
        return;
      }

      if (!hasCommandModifier) {
        return;
      }

      if (event.code === "KeyC") {
        event.preventDefault();
        copySelection();
        return;
      }

      if (event.code === "KeyV") {
        event.preventDefault();
        pasteClipboard();
        return;
      }

      if (event.code === "KeyL") {
        if (board.selection.nodeIds.length !== 1) {
          return;
        }

        const sourceNodeId = board.selection.nodeIds[0];
        const sourceNode = sourceNodeId ? board.nodes[sourceNodeId] : undefined;
        if (!sourceNode) {
          return;
        }

        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(sourceNode.id);
        setLinkPreviewPoint(latestPointerWorldPointRef.current ?? getFallbackLinkPreviewPoint(sourceNode));
        return;
      }

      if (event.code === "KeyZ") {
        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(null);
        setLinkPreviewPoint(null);
        undoBoardCommand();
      }

      if (event.code === "KeyY") {
        event.preventDefault();
        setEditingNodeId(null);
        setEditingDraft(null);
        setLinkSourceNodeId(null);
        setLinkPreviewPoint(null);
        redoBoardCommand();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    board.nodes,
    board.selection.nodeIds,
    copySelection,
    createLinkedEditableTextNode,
    deleteSelection,
    editingNodeId,
    editingDraft,
    openSearch,
    pasteClipboard,
    redoBoardCommand,
    runBoardCommand,
    saveCurrentBoardNow,
    undoBoardCommand
  ]);

  const createNodeFromBlankDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (isCanvasEdgeCreationFollowUpActive()) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const screenPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const edgeHit = hitTestEdges(edges, board.nodes, screenPoint, viewport);
    if (edgeHit) {
      runBoardCommand(
        new InsertEdgeFixedPointCommand({
          clock: new Date().toISOString(),
          edgeId: edgeHit.edgeId,
          index: edgeHit.insertionIndex,
          point: edgeHit.worldPoint
        })
      );
      selectEdges([edgeHit.edgeId]);
      setHoveredEdgeId(edgeHit.edgeId);
      return;
    }

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

  const beginFixedPointDrag = (edgeId: string, index: number, event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) {
      return;
    }

    const point = board.edges[edgeId]?.fixedPoints[index];
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectEdges([edgeId]);
    fixedPointDragStateRef.current = {
      edgeId,
      index,
      startPoint: point
    };
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

  const beginNodeResize = (nodeId: NodeId, corner: ResizeCorner, event: PointerEvent<HTMLElement>): void => {
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
      corner,
      nodeId,
      startPosition: node.position,
      startScreenPoint: { x: event.clientX, y: event.clientY },
      startSize: node.size
    };
    setResizePreview(null);
  };

  const updatePointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    const currentScreenPoint = getLocalScreenPoint(event);
    const currentWorldPoint = screenToWorld(currentScreenPoint, viewport);
    latestPointerWorldPointRef.current = currentWorldPoint;

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

    const resizeState = resizeStateRef.current;
    if (resizeState) {
      setResizePreview(calculateResizeGeometry(resizeState, { x: event.clientX, y: event.clientY }, viewport.zoom));
      return;
    }

    if (fixedPointDragStateRef.current) {
      return;
    }

    if (linkSourceNodeId) {
      setLinkPreviewPoint(currentWorldPoint);
      setHoveredEdgeId(null);
      return;
    }

    const selectionState = selectionBoxRef.current;
    if (!selectionState) {
      const edgeHit = hitTestEdges(edges, previewNodesById, currentScreenPoint, viewport);
      setHoveredEdgeId(edgeHit?.edgeId ?? null);
      return;
    }

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
    setResizePreview(null);
    const nextGeometry = calculateResizeGeometry(resizeState, { x: event.clientX, y: event.clientY }, viewport.zoom);

    if (
      nextGeometry.size.width === resizeState.startSize.width &&
      nextGeometry.size.height === resizeState.startSize.height &&
      nextGeometry.position.x === resizeState.startPosition.x &&
      nextGeometry.position.y === resizeState.startPosition.y
    ) {
      return;
    }

    runBoardCommand(
      new ResizeNodeCommand({
        clock: new Date().toISOString(),
        id: resizeState.nodeId,
        position: nextGeometry.position,
        size: nextGeometry.size
      })
    );
  };

  const finishFixedPointDrag = (event: PointerEvent<HTMLElement>): void => {
    const fixedPointDragState = fixedPointDragStateRef.current;
    if (!fixedPointDragState) {
      return;
    }

    fixedPointDragStateRef.current = null;
    const element = containerRef.current ?? event.currentTarget;
    const point = screenToWorld(getElementLocalScreenPoint(element, event.clientX, event.clientY), viewport);
    if (point.x === fixedPointDragState.startPoint.x && point.y === fixedPointDragState.startPoint.y) {
      return;
    }

    runBoardCommand(
      new MoveEdgeFixedPointCommand({
        clock: new Date().toISOString(),
        edgeId: fixedPointDragState.edgeId,
        index: fixedPointDragState.index,
        point
      })
    );
    selectEdges([fixedPointDragState.edgeId]);
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

      const edgeHit = hitTestEdges(edges, previewNodesById, endScreenPoint, viewport);
      if (edgeHit) {
        selectEdges([edgeHit.edgeId]);
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
    finishFixedPointDrag(event);
    finishNodeResize(event);
    finishNodeDrag(event);
    finishSelectionBox(event);
    endPan(event);
  };

  const cancelPointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
    fixedPointDragStateRef.current = null;
    resizeStateRef.current = null;
    dragStateRef.current = null;
    selectionBoxRef.current = null;
    setResizePreview(null);
    setDragPreview(null);
    setSelectionBox(null);
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
      setLinkPreviewPoint(null);
      return;
    }

    setEditingNodeId(null);
    setEditingDraft(null);
    setLinkSourceNodeId(null);
    setLinkPreviewPoint(null);
    markEdgeCreationFollowUp(to);
    runBoardCommand(
      new CreateEdgeCommand({
        clock: new Date().toISOString(),
        edgeId: `edge_${nanoid()}`,
        edgeStyle: defaultEdgeStyle,
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

  const updateSelectedEdgeStyle = (patch: EdgeStylePatch): void => {
    if (!selectedEdge) {
      return;
    }

    runBoardCommand(
      new UpdateEdgeStyleCommand({
        clock: new Date().toISOString(),
        edgeId: selectedEdge.id,
        patch
      })
    );
  };

  const zoomFromWheel = useCallback((event: globalThis.WheelEvent): void => {
    const shouldZoom = wheelZoomMode === "directWheel" || event.ctrlKey || event.metaKey;
    if (!shouldZoom) {
      return;
    }

    event.preventDefault();
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomByScreenPoint(getElementLocalScreenPoint(element, event.clientX, event.clientY), zoomFactor);
  }, [wheelZoomMode, zoomByScreenPoint]);

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
      onPointerCancel={cancelPointerInteraction}
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
        edges={previewEdges}
        nodes={previewNodesById}
        onVisibleEdgeCountChange={setVisibleEdgeCount}
        selectedEdgeIds={board.selection.edgeIds}
        size={canvasSize}
        viewport={viewport}
      />
      <EdgeControlLayer
        edge={controlEdge}
        showToolbar={Boolean(selectedEdge)}
        nodes={previewNodesById}
        onEdgeStyleChange={updateSelectedEdgeStyle}
        onFixedPointPointerDown={beginFixedPointDrag}
        onFixedPointPointerUp={finishFixedPointDrag}
        viewport={viewport}
      />
      <NodeDomLayer
        activeEditNodeId={editingNodeId}
        dragPreview={dragPreview}
        nodeGeometryOverrides={nodeGeometryOverrides}
        nodes={nodes}
        onNodeClick={selectNode}
        onNodeDoubleClick={editNode}
        onNodePointerDown={beginNodeDrag}
        onNodeResizePointerDown={beginNodeResize}
        onVisibleNodeCountChange={setVisibleNodeCount}
        onTextDraftChange={updateNodeTextDraft}
        onTextCommit={commitNodeText}
        activeSearchNodeId={activeSearchNodeId ?? null}
        searchMatchNodeIds={searchMatchNodeIds}
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

function applyNodePreviews(
  nodes: Record<string, BoardNode>,
  geometryOverrides: Partial<Record<NodeId, NodeGeometryOverride>>,
  dragPreview: DragPreview | null
): Record<string, BoardNode> {
  let nextNodes = nodes;

  const updateNode = (nodeId: NodeId, patch: Partial<Pick<BoardNode, "position" | "size">>): void => {
    const node = nextNodes[nodeId];
    if (!node) {
      return;
    }

    if (nextNodes === nodes) {
      nextNodes = { ...nodes };
    }

    nextNodes[nodeId] = {
      ...node,
      ...patch
    };
  };

  for (const [nodeId, override] of Object.entries(geometryOverrides)) {
    if (override) {
      updateNode(nodeId, override);
    }
  }

  if (dragPreview) {
    for (const nodeId of dragPreview.nodeIds) {
      const node = nextNodes[nodeId];
      if (!node) {
        continue;
      }

      updateNode(nodeId, {
        position: {
          x: node.position.x + dragPreview.delta.x,
          y: node.position.y + dragPreview.delta.y
        }
      });
    }
  }

  return nextNodes;
}

function createLinkPreviewEdge(
  sourceNodeId: NodeId,
  point: Point,
  edgeStyle: Pick<BoardEdge, "pathType" | "arrow" | "stroke">
): BoardEdge {
  return {
    id: LINK_PREVIEW_EDGE_ID,
    from: { type: "node", nodeId: sourceNodeId },
    to: { type: "point", point },
    fixedPoints: [],
    pathType: edgeStyle.pathType,
    arrow: edgeStyle.arrow,
    stroke: { ...edgeStyle.stroke }
  };
}

function getFallbackLinkPreviewPoint(sourceNode: BoardNode): Point {
  return {
    x: sourceNode.position.x + sourceNode.size.width + 80,
    y: sourceNode.position.y + sourceNode.size.height / 2
  };
}

function calculateResizeGeometry(resizeState: ResizeState, currentScreenPoint: Point, zoom: number): ResizePreview {
  const delta = screenDeltaToWorldDelta(
    {
      x: currentScreenPoint.x - resizeState.startScreenPoint.x,
      y: currentScreenPoint.y - resizeState.startScreenPoint.y
    },
    zoom
  );
  const resizeFromLeft = resizeState.corner.endsWith("left");
  const resizeFromTop = resizeState.corner.startsWith("top");
  const width = resizeFromLeft
    ? Math.max(MIN_NODE_SIZE.width, resizeState.startSize.width - delta.x)
    : Math.max(MIN_NODE_SIZE.width, resizeState.startSize.width + delta.x);
  const height = resizeFromTop
    ? Math.max(MIN_NODE_SIZE.height, resizeState.startSize.height - delta.y)
    : Math.max(MIN_NODE_SIZE.height, resizeState.startSize.height + delta.y);

  return {
    nodeId: resizeState.nodeId,
    position: {
      x: resizeFromLeft
        ? resizeState.startPosition.x + resizeState.startSize.width - width
        : resizeState.startPosition.x,
      y: resizeFromTop
        ? resizeState.startPosition.y + resizeState.startSize.height - height
        : resizeState.startPosition.y
    },
    size: { width, height }
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
