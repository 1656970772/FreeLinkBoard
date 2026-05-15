import type { ChangeEvent, PointerEvent, ReactElement } from "react";
import { approximateEdgePathPoints } from "../../../application/geometry/edgePathGeometry";
import { worldToScreen } from "../../../application/geometry/viewportTransform";
import type { BoardEdge, BoardNode, Viewport } from "../../../domain/board/types";

export type EdgeStylePatch = {
  pathType?: BoardEdge["pathType"];
  arrow?: BoardEdge["arrow"];
  stroke?: Partial<BoardEdge["stroke"]>;
};

export type EdgeControlLayerProps = {
  edge: BoardEdge | null;
  nodes: Record<string, BoardNode>;
  viewport: Viewport;
  onEdgeStyleChange: (patch: EdgeStylePatch) => void;
};

export function EdgeControlLayer({
  edge,
  nodes,
  onEdgeStyleChange,
  viewport
}: EdgeControlLayerProps): ReactElement | null {
  if (!edge) {
    return null;
  }

  const anchor = getToolbarAnchor(edge, nodes, viewport);
  if (!anchor) {
    return null;
  }

  const stopCanvasPointerHandling = (event: PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
  };

  return (
    <div
      data-testid="edge-floating-toolbar"
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={stopCanvasPointerHandling}
      onPointerMove={stopCanvasPointerHandling}
      onPointerUp={stopCanvasPointerHandling}
      style={{
        alignItems: "center",
        background: "#fffdf8",
        border: "1px solid rgba(36, 34, 31, 0.2)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(36, 34, 31, 0.14)",
        display: "flex",
        gap: 6,
        left: anchor.x,
        padding: 6,
        pointerEvents: "auto",
        position: "absolute",
        top: anchor.y,
        transform: "translate(-50%, -100%)",
        zIndex: 3
      }}
    >
      <select
        aria-label="Path type"
        data-testid="edge-toolbar-path-type"
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onEdgeStyleChange({ pathType: event.target.value as BoardEdge["pathType"] })
        }
        style={controlStyle}
        value={edge.pathType}
      >
        <option value="bezier">Bezier</option>
        <option value="straight">Straight</option>
        <option value="roundedElbow">Elbow</option>
      </select>
      <select
        aria-label="Arrow"
        data-testid="edge-toolbar-arrow"
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onEdgeStyleChange({ arrow: event.target.value as BoardEdge["arrow"] })
        }
        style={controlStyle}
        value={edge.arrow}
      >
        <option value="none">None</option>
        <option value="end">End</option>
        <option value="both">Both</option>
      </select>
      <select
        aria-label="Dash"
        data-testid="edge-toolbar-dash"
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onEdgeStyleChange({ stroke: { dash: event.target.value as BoardEdge["stroke"]["dash"] } })
        }
        style={controlStyle}
        value={edge.stroke.dash}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
      </select>
      <input
        aria-label="Color"
        data-testid="edge-toolbar-color"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onEdgeStyleChange({ stroke: { color: event.target.value } })}
        style={{ ...controlStyle, padding: 2, width: 34 }}
        type="color"
        value={edge.stroke.color}
      />
      <input
        aria-label="Width"
        data-testid="edge-toolbar-width"
        max={12}
        min={1}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const width = clampEdgeWidth(event.target.value);
          if (width === null) {
            return;
          }

          onEdgeStyleChange({ stroke: { width } });
        }}
        style={{ ...controlStyle, width: 48 }}
        type="number"
        value={edge.stroke.width}
      />
    </div>
  );
}

const controlStyle = {
  background: "#fffdf8",
  border: "1px solid rgba(36, 34, 31, 0.18)",
  borderRadius: 4,
  color: "#24221f",
  fontSize: 12,
  height: 28
};

function getToolbarAnchor(
  edge: BoardEdge,
  nodes: Record<string, BoardNode>,
  viewport: Viewport
): { x: number; y: number } | null {
  const points = approximateEdgePathPoints(edge, nodes);
  if (points.length === 0) {
    return null;
  }

  const middlePoint = points[Math.floor(points.length / 2)]!;
  const screenPoint = worldToScreen(middlePoint, viewport);

  return {
    x: screenPoint.x,
    y: Math.max(8, screenPoint.y - 12)
  };
}

function clampEdgeWidth(rawValue: string): number | null {
  if (rawValue.trim() === "") {
    return null;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.min(12, Math.max(1, value));
}
