import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactElement, RefObject, WheelEvent } from "react";
import type { BoardState, Point, Size } from "../../domain/board/types";
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
  const [visibleEdgeCount, setVisibleEdgeCount] = useState(0);
  const [visibleNodeCount, setVisibleNodeCount] = useState(0);
  const panStartRef = useRef<Point | null>(null);
  const nodes = useMemo(() => Object.values(board.nodes), [board.nodes]);
  const edges = useMemo(() => Object.values(board.edges), [board.edges]);

  const beginPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 1 && event.button !== 2) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panStartRef.current = { x: event.clientX, y: event.clientY };
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

  const endPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (panStartRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panStartRef.current = null;
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
      onPointerUp={endPan}
      onPointerCancel={endPan}
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
        nodes={nodes}
        onVisibleNodeCountChange={setVisibleNodeCount}
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
