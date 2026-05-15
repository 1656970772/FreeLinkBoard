import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../src/application/geometry/viewportTransform",
  () => ({
    clampZoom: (zoom: number) => Math.min(4, Math.max(0.1, zoom)),
    zoomViewportAtScreenPoint: (
      viewport: { x: number; y: number; zoom: number },
      screenPoint: { x: number; y: number },
      nextZoom: number
    ) => {
      const clampedZoom = Math.min(4, Math.max(0.1, nextZoom));
      const worldPoint = {
        x: screenPoint.x / viewport.zoom + viewport.x,
        y: screenPoint.y / viewport.zoom + viewport.y
      };

      return {
        x: worldPoint.x - screenPoint.x / clampedZoom,
        y: worldPoint.y - screenPoint.y / clampedZoom,
        zoom: clampedZoom
      };
    }
  })
);

import { useCanvasViewport } from "../../../src/renderer/board/useCanvasViewport";

describe("useCanvasViewport", () => {
  it("pans by screen deltas in world units", () => {
    const { result } = renderHook(() => useCanvasViewport({ x: 100, y: 60, zoom: 2 }));

    act(() => {
      result.current.panByScreenDelta({ x: 20, y: -10 });
    });

    expect(result.current.viewport).toEqual({ x: 90, y: 65, zoom: 2 });
  });

  it("clamps zoom when zooming at a screen point", () => {
    const { result } = renderHook(() => useCanvasViewport({ x: 0, y: 0, zoom: 1 }));

    act(() => {
      result.current.zoomAtScreenPoint({ x: 100, y: 100 }, 20);
    });

    expect(result.current.viewport.zoom).toBe(4);

    act(() => {
      result.current.zoomAtScreenPoint({ x: 100, y: 100 }, 0.01);
    });

    expect(result.current.viewport.zoom).toBe(0.1);
  });

  it("preserves the world point under the cursor while zooming", () => {
    const { result } = renderHook(() => useCanvasViewport({ x: 40, y: 80, zoom: 2 }));
    const screenPoint = { x: 160, y: 120 };
    const worldBefore = {
      x: screenPoint.x / result.current.viewport.zoom + result.current.viewport.x,
      y: screenPoint.y / result.current.viewport.zoom + result.current.viewport.y
    };

    act(() => {
      result.current.zoomAtScreenPoint(screenPoint, 1);
    });

    const worldAfter = {
      x: screenPoint.x / result.current.viewport.zoom + result.current.viewport.x,
      y: screenPoint.y / result.current.viewport.zoom + result.current.viewport.y
    };

    expect(worldAfter).toEqual(worldBefore);
  });

  it("accumulates wheel zoom factors from the latest viewport state", () => {
    const { result } = renderHook(() => useCanvasViewport({ x: 40, y: 80, zoom: 1 }));
    const screenPoint = { x: 200, y: 120 };

    act(() => {
      result.current.zoomByScreenPoint(screenPoint, 1.1);
      result.current.zoomByScreenPoint(screenPoint, 1.1);
    });

    expect(result.current.viewport.zoom).toBeCloseTo(1.21);
  });
});
