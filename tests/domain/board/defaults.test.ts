import { describe, expect, it } from "vitest";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";

describe("board defaults", () => {
  it("creates an empty board with stable default viewport and settings", () => {
    const state = createEmptyBoardState("board-1");

    expect(state.id).toBe("board-1");
    expect(state.title).toBe("Untitled Board");
    expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(state.nodes).toEqual({});
    expect(state.edges).toEqual({});
    expect(state.selection).toEqual({ nodeIds: [], edgeIds: [] });
    expect(defaultBoardSettings.edgeStyle).toEqual({
      pathType: "bezier",
      arrow: "end",
      stroke: { color: "#2f6f6a", width: 2, dash: "solid" }
    });
  });
});
