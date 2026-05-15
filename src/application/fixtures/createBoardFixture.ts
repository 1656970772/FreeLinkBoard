import { createEmptyBoardState, defaultBoardSettings } from "../../domain/board/defaults";
import type { BoardEdge, BoardNode, BoardState } from "../../domain/board/types";

export type BoardFixtureOptions = {
  nodeCount: number;
  edgeCount: number;
};

const FIXTURE_TIME = "2026-05-15T00:00:00.000Z";
const COLUMNS = 100;
const COLUMN_GAP = 260;
const ROW_GAP = 180;

export function createBoardFixture(options: BoardFixtureOptions): BoardState {
  if (options.nodeCount < 0 || options.edgeCount < 0) {
    throw new Error("Fixture counts must be non-negative.");
  }
  if (options.edgeCount > 0 && options.nodeCount === 0) {
    throw new Error("Cannot create node-referenced edges without nodes.");
  }

  const board = createEmptyBoardState("fixture-board", FIXTURE_TIME);
  board.title = "Fixture Board";

  for (let index = 0; index < options.nodeCount; index += 1) {
    const node = createFixtureNode(index);
    board.nodes[node.id] = node;
  }

  for (let index = 0; index < options.edgeCount; index += 1) {
    const edge = createFixtureEdge(index, options.nodeCount);
    board.edges[edge.id] = edge;
  }

  return board;
}

function createFixtureNode(index: number): BoardNode {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);

  return {
    id: formatId("fixture-node", index),
    type: "text",
    position: {
      x: column * COLUMN_GAP,
      y: row * ROW_GAP
    },
    size: defaultBoardSettings.textNodeSize,
    sizing: "fixed",
    text: `Fixture node ${index + 1}`,
    style: defaultBoardSettings.textNodeStyle
  };
}

function createFixtureEdge(index: number, nodeCount: number): BoardEdge {
  const fromIndex = index % nodeCount;
  const toIndex = (index * 7 + 1) % nodeCount;

  return {
    id: formatId("fixture-edge", index),
    from: { type: "node", nodeId: formatId("fixture-node", fromIndex) },
    to: { type: "node", nodeId: formatId("fixture-node", toIndex) },
    fixedPoints: [],
    ...defaultBoardSettings.edgeStyle
  };
}

function formatId(prefix: string, index: number): string {
  return `${prefix}-${index.toString().padStart(5, "0")}`;
}
