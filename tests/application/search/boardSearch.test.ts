import { describe, expect, it } from "vitest";
import { searchTextNodes } from "../../../src/application/search/boardSearch";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardState, TextNode } from "../../../src/domain/board/types";

function createTextNode(id: string, text: string): TextNode {
  return {
    id,
    type: "text",
    position: { x: 0, y: 0 },
    size: defaultBoardSettings.textNodeSize,
    sizing: "auto",
    text,
    style: defaultBoardSettings.textNodeStyle
  };
}

function createBoard(nodes: TextNode[]): BoardState {
  return {
    id: "board",
    title: "Board",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    edges: {},
    selection: { nodeIds: [], edgeIds: [] },
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
}

describe("searchTextNodes", () => {
  it("returns an empty list when the trimmed query is empty", () => {
    const board = createBoard([createTextNode("node-a", "Alpha")]);

    expect(searchTextNodes(board, "   ")).toEqual([]);
  });

  it("finds all case-insensitive matches with open-ended ranges", () => {
    const board = createBoard([
      createTextNode("node-a", "Alpha alpha ALPHA"),
      createTextNode("node-b", "No match here")
    ]);

    expect(searchTextNodes(board, " alpha ")).toEqual([
      {
        nodeId: "node-a",
        text: "Alpha alpha ALPHA",
        matchCount: 3,
        ranges: [
          { start: 0, end: 5 },
          { start: 6, end: 11 },
          { start: 12, end: 17 }
        ]
      }
    ]);
  });

  it("returns results in board node value order", () => {
    const board = createBoard([
      createTextNode("node-a", "Second match"),
      createTextNode("node-b", "First match")
    ]);

    expect(searchTextNodes(board, "match").map((result) => result.nodeId)).toEqual(["node-a", "node-b"]);
  });
});
