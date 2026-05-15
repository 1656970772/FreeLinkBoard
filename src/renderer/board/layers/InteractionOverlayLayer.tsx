import type { ReactElement } from "react";
import type { Viewport } from "../../../domain/board/types";

export type InteractionOverlayLayerProps = {
  viewport: Viewport;
  visibleNodeCount: number;
  visibleEdgeCount: number;
};

export function InteractionOverlayLayer({
  viewport,
  visibleEdgeCount,
  visibleNodeCount
}: InteractionOverlayLayerProps): ReactElement {
  return (
    <div
      data-testid="interaction-overlay-layer"
      style={{
        background: "rgba(255, 253, 248, 0.86)",
        border: "1px solid rgba(36, 34, 31, 0.16)",
        borderRadius: 6,
        bottom: 12,
        color: "#24221f",
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
        fontSize: 12,
        left: 12,
        padding: "6px 8px",
        pointerEvents: "none",
        position: "absolute"
      }}
    >
      x {viewport.x.toFixed(0)} y {viewport.y.toFixed(0)} zoom {viewport.zoom.toFixed(2)} nodes {visibleNodeCount} edges{" "}
      {visibleEdgeCount}
    </div>
  );
}
