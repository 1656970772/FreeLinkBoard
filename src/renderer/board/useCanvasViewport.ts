import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Point, Viewport } from "../../domain/board/types";
import { clampZoom, zoomViewportAtScreenPoint } from "../../application/geometry/viewportTransform";

export type UseCanvasViewportResult = {
  viewport: Viewport;
  setViewport: Dispatch<SetStateAction<Viewport>>;
  panByScreenDelta: (delta: Point) => void;
  zoomAtScreenPoint: (screenPoint: Point, nextZoom: number) => void;
};

export function useCanvasViewport(initialViewport: Viewport): UseCanvasViewportResult {
  const [viewport, setViewport] = useState<Viewport>(initialViewport);

  const panByScreenDelta = useCallback((delta: Point) => {
    setViewport((current) => ({
      ...current,
      x: current.x - delta.x / current.zoom,
      y: current.y - delta.y / current.zoom
    }));
  }, []);

  const zoomAtScreenPoint = useCallback((screenPoint: Point, nextZoom: number) => {
    setViewport((current) => zoomViewportAtScreenPoint(current, screenPoint, clampZoom(nextZoom)));
  }, []);

  return {
    viewport,
    setViewport,
    panByScreenDelta,
    zoomAtScreenPoint
  };
}
