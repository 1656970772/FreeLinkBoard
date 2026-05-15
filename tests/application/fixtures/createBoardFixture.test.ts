import { describe, expect, it } from "vitest";
import { createBoardFixture } from "../../../src/application/fixtures/createBoardFixture";

describe("createBoardFixture", () => {
  it("returns the requested node and edge counts", () => {
    const board = createBoardFixture({ nodeCount: 100, edgeCount: 160 });

    expect(Object.keys(board.nodes)).toHaveLength(100);
    expect(Object.keys(board.edges)).toHaveLength(160);
  });

  it("uses stable first node and first edge ids", () => {
    const board = createBoardFixture({ nodeCount: 3, edgeCount: 2 });

    expect(Object.keys(board.nodes)[0]).toBe("fixture-node-00000");
    expect(Object.keys(board.edges)[0]).toBe("fixture-edge-00000");
  });

  it("generates edges that reference existing nodes", () => {
    const board = createBoardFixture({ nodeCount: 25, edgeCount: 40 });
    const nodeIds = new Set(Object.keys(board.nodes));

    for (const edge of Object.values(board.edges)) {
      expect(edge.from.type).toBe("node");
      expect(edge.to.type).toBe("node");
      if (edge.from.type === "node") {
        expect(nodeIds.has(edge.from.nodeId)).toBe(true);
      }
      if (edge.to.type === "node") {
        expect(nodeIds.has(edge.to.nodeId)).toBe(true);
      }
    }
  });

  it("is deterministic for the same options", () => {
    expect(createBoardFixture({ nodeCount: 10, edgeCount: 12 })).toEqual(
      createBoardFixture({ nodeCount: 10, edgeCount: 12 })
    );
  });
});
