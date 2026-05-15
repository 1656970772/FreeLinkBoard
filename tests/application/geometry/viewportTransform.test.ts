import { describe, expect, it } from "vitest";
import type { Viewport } from "../../../src/domain/board/types";
import { boundsIntersect } from "../../../src/application/geometry/bounds";
import {
  getVisibleWorldRect,
  screenToWorld,
  worldToScreen,
  zoomViewportAtScreenPoint
} from "../../../src/application/geometry/viewportTransform";

describe("viewport transform", () => {
  it("maps world coordinates to CSS pixels from the viewport top-left", () => {
    const viewport: Viewport = { x: 100, y: 50, zoom: 2 };

    expect(worldToScreen({ x: 140, y: 80 }, viewport)).toEqual({ x: 80, y: 60 });
  });

  it("maps screen coordinates back to world coordinates", () => {
    const viewport: Viewport = { x: -25, y: 40, zoom: 0.5 };

    expect(screenToWorld({ x: 100, y: 30 }, viewport)).toEqual({ x: 175, y: 100 });
  });

  it("calculates visible world rect expanded by screen-pixel padding", () => {
    const viewport: Viewport = { x: 100, y: 200, zoom: 2 };

    expect(getVisibleWorldRect(viewport, { width: 800, height: 600 }, 40)).toEqual({
      x: 80,
      y: 180,
      width: 440,
      height: 340
    });
  });

  it("preserves the world point under the cursor when zooming", () => {
    const viewport: Viewport = { x: 100, y: 200, zoom: 1 };
    const screenPoint = { x: 250, y: 150 };
    const worldBefore = screenToWorld(screenPoint, viewport);

    const nextViewport = zoomViewportAtScreenPoint(viewport, screenPoint, 2);

    expect(nextViewport.zoom).toBe(2);
    expect(screenToWorld(screenPoint, nextViewport)).toEqual(worldBefore);
  });

  it("clamps zoom between 0.1 and 4", () => {
    const viewport: Viewport = { x: 0, y: 0, zoom: 1 };

    expect(zoomViewportAtScreenPoint(viewport, { x: 0, y: 0 }, 0.01).zoom).toBe(0.1);
    expect(zoomViewportAtScreenPoint(viewport, { x: 0, y: 0 }, 8).zoom).toBe(4);
  });
});

describe("bounds", () => {
  it("counts edge-touching rectangles as intersecting", () => {
    expect(
      boundsIntersect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 100, y: 25, width: 50, height: 50 }
      )
    ).toBe(true);
  });

  it("rejects rectangles separated by a gap", () => {
    expect(
      boundsIntersect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 101, y: 25, width: 50, height: 50 }
      )
    ).toBe(false);
  });
});
