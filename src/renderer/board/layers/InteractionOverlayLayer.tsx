import type { ReactElement } from "react";
import type { Bounds } from "../../../application/geometry/bounds";
import type { Viewport } from "../../../domain/board/types";

export type InteractionOverlayLayerProps = {
  selectionBox?: Bounds | null;
  viewport: Viewport;
  visibleNodeCount: number;
  visibleEdgeCount: number;
};

export function InteractionOverlayLayer({
  selectionBox,
  viewport,
  visibleEdgeCount,
  visibleNodeCount
}: InteractionOverlayLayerProps): ReactElement {
  return (
    <>
      {selectionBox ? (
        <div
          data-testid="selection-box"
          style={{
            background: "rgba(47, 111, 106, 0.12)",
            border: "1px solid rgba(47, 111, 106, 0.72)",
            height: selectionBox.height,
            left: selectionBox.x,
            pointerEvents: "none",
            position: "absolute",
            top: selectionBox.y,
            width: selectionBox.width
          }}
        />
      ) : null}
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
        x {viewport.x.toFixed(0)} y {viewport.y.toFixed(0)} zoom {viewport.zoom.toFixed(2)} nodes {visibleNodeCount}{" "}
        edges {visibleEdgeCount}
      </div>
    </>
  );
}
