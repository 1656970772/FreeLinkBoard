import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import type { Size, Viewport } from "../../../domain/board/types";

export type GridCanvasLayerProps = {
  viewport: Viewport;
  size: Size;
};

export function GridCanvasLayer({ viewport, size }: GridCanvasLayerProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    context.save();
    context.scale(dpr, dpr);
    context.clearRect(0, 0, size.width, size.height);
    context.strokeStyle = "#d8d2c7";
    context.lineWidth = 1;

    const gridSize = 64;
    const screenGrid = gridSize * viewport.zoom;
    const startX = -((viewport.x * viewport.zoom) % screenGrid);
    const startY = -((viewport.y * viewport.zoom) % screenGrid);

    context.beginPath();
    for (let x = startX; x <= size.width; x += screenGrid) {
      context.moveTo(x, 0);
      context.lineTo(x, size.height);
    }
    for (let y = startY; y <= size.height; y += screenGrid) {
      context.moveTo(0, y);
      context.lineTo(size.width, y);
    }
    context.stroke();
    context.restore();
  }, [size.height, size.width, viewport.x, viewport.y, viewport.zoom]);

  return (
    <canvas
      aria-hidden="true"
      data-testid="grid-canvas-layer"
      ref={canvasRef}
      style={{ inset: 0, position: "absolute" }}
    />
  );
}
