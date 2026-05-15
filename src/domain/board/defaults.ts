import type { BoardDefaults, BoardId, BoardState } from "./types";

export const defaultBoardSettings: BoardDefaults = {
  textNodeSize: { width: 160, height: 56 },
  textNodeStyle: {
    borderColor: "#24221f",
    backgroundColor: "#fffdf8",
    textColor: "#24221f"
  },
  edgeStyle: {
    pathType: "bezier",
    arrow: "end",
    stroke: { color: "#2f6f6a", width: 2, dash: "solid" }
  }
};

export function createEmptyBoardState(id: BoardId, now = "2026-05-15T00:00:00.000Z"): BoardState {
  return {
    id,
    title: "Untitled Board",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: {},
    edges: {},
    selection: { nodeIds: [], edgeIds: [] },
    createdAt: now,
    updatedAt: now
  };
}
