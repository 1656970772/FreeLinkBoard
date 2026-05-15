import type { Point, Size, Viewport } from "../../domain/board/types";
import type { Bounds } from "./bounds";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.x) * viewport.zoom,
    y: (point.y - viewport.y) * viewport.zoom
  };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return {
    x: point.x / viewport.zoom + viewport.x,
    y: point.y / viewport.zoom + viewport.y
  };
}

export function getVisibleWorldRect(viewport: Viewport, size: Size, padding = 0): Bounds {
  const paddedTopLeft = screenToWorld({ x: -padding, y: -padding }, viewport);
  const paddedBottomRight = screenToWorld(
    { x: size.width + padding, y: size.height + padding },
    viewport
  );

  return {
    x: paddedTopLeft.x,
    y: paddedTopLeft.y,
    width: paddedBottomRight.x - paddedTopLeft.x,
    height: paddedBottomRight.y - paddedTopLeft.y
  };
}

export function zoomViewportAtScreenPoint(
  viewport: Viewport,
  screenPoint: Point,
  nextZoom: number
): Viewport {
  const zoom = clampZoom(nextZoom);
  const worldPoint = screenToWorld(screenPoint, viewport);

  return {
    x: worldPoint.x - screenPoint.x / zoom,
    y: worldPoint.y - screenPoint.y / zoom,
    zoom
  };
}
