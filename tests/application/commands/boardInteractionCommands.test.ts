import { describe, expect, it } from "vitest";
import {
  CreateTextNodeCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../../src/application/commands/boardInteractionCommands";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardNode, BoardState } from "../../../src/domain/board/types";

const INITIAL_TIME = "2026-05-15T00:00:00.000Z";
const COMMAND_TIME = "2026-05-15T01:23:45.000Z";

function createNode(id: string, x: number, y: number, text = "Node"): BoardNode {
  return {
    id,
    type: "text",
    position: { x, y },
    size: defaultBoardSettings.textNodeSize,
    sizing: "auto",
    text,
    style: defaultBoardSettings.textNodeStyle
  };
}

function createBoardWithNodes(nodes: BoardNode[]): BoardState {
  return {
    ...createEmptyBoardState("board-1", INITIAL_TIME),
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
    selection: { nodeIds: nodes.slice(0, 1).map((node) => node.id), edgeIds: ["edge-1"] }
  };
}

describe("board interaction commands", () => {
  it("estimates text node size from default width and wrapped text height", () => {
    expect(estimateTextNodeSize("Short")).toEqual(defaultBoardSettings.textNodeSize);
    expect(estimateTextNodeSize("Line one\nLine two\nLine three")).toEqual({
      width: defaultBoardSettings.textNodeSize.width,
      height: 88
    });
  });

  it("creates a text node at a point, selects it, and undoes the creation", () => {
    const board = createBoardWithNodes([createNode("existing", 10, 20)]);
    const command = new CreateTextNodeCommand({
      clock: COMMAND_TIME,
      id: "node-1",
      position: { x: 120, y: 240 },
      text: "New idea"
    });

    const afterCreate = command.execute(board);

    expect(afterCreate.nodes["node-1"]).toEqual({
      id: "node-1",
      type: "text",
      position: { x: 120, y: 240 },
      size: estimateTextNodeSize("New idea"),
      sizing: "auto",
      text: "New idea",
      style: defaultBoardSettings.textNodeStyle
    });
    expect(afterCreate.selection).toEqual({ nodeIds: ["node-1"], edgeIds: [] });
    expect(afterCreate.updatedAt).toBe(COMMAND_TIME);

    const afterUndo = command.undo(afterCreate);

    expect(afterUndo.nodes["node-1"]).toBeUndefined();
    expect(afterUndo.nodes.existing).toEqual(board.nodes.existing);
    expect(afterUndo.selection).toEqual(board.selection);
    expect(afterUndo.updatedAt).toBe(INITIAL_TIME);
  });

  it("updates text node content and height, then restores the previous node on undo", () => {
    const node = createNode("node-1", 0, 0, "Before");
    const board = createBoardWithNodes([node]);
    const nextText = "Line one\nLine two\nLine three";
    const command = new UpdateTextNodeCommand({
      clock: COMMAND_TIME,
      id: "node-1",
      text: nextText
    });

    const afterUpdate = command.execute(board);

    expect(afterUpdate.nodes["node-1"]).toEqual({
      ...node,
      text: nextText,
      size: estimateTextNodeSize(nextText)
    });
    expect(afterUpdate.updatedAt).toBe(COMMAND_TIME);

    const afterUndo = command.undo(afterUpdate);

    expect(afterUndo.nodes["node-1"]).toEqual(node);
    expect(afterUndo.updatedAt).toBe(INITIAL_TIME);
  });

  it("keeps fixed-size text nodes at their existing size when text changes", () => {
    const fixedNode = {
      ...createNode("node-1", 0, 0, "Before"),
      size: { width: 240, height: 80 },
      sizing: "fixed" as const
    };
    const board = createBoardWithNodes([fixedNode]);
    const command = new UpdateTextNodeCommand({
      clock: COMMAND_TIME,
      id: "node-1",
      text: "Line one\nLine two\nLine three\nLine four"
    });

    const afterUpdate = command.execute(board);

    expect(afterUpdate.nodes["node-1"]).toEqual({
      ...fixedNode,
      text: "Line one\nLine two\nLine three\nLine four"
    });
    expect(afterUpdate.nodes["node-1"]?.size).toEqual({ width: 240, height: 80 });
  });

  it("resizes a text node into fixed sizing and can undo the resize", () => {
    const node = createNode("node-1", 0, 0);
    const board = createBoardWithNodes([node]);
    const command = new ResizeNodeCommand({
      clock: COMMAND_TIME,
      id: "node-1",
      size: { width: 260, height: 120 }
    });

    const afterResize = command.execute(board);

    expect(afterResize.nodes["node-1"]).toEqual({
      ...node,
      size: { width: 260, height: 120 },
      sizing: "fixed"
    });
    expect(afterResize.updatedAt).toBe(COMMAND_TIME);

    const afterUndo = command.undo(afterResize);

    expect(afterUndo.nodes["node-1"]).toEqual(node);
    expect(afterUndo.updatedAt).toBe(INITIAL_TIME);
  });

  it("does not change board state when resizing a missing node", () => {
    const board = createBoardWithNodes([createNode("node-1", 0, 0)]);
    const command = new ResizeNodeCommand({
      clock: COMMAND_TIME,
      id: "missing",
      size: { width: 260, height: 120 }
    });

    const afterResize = command.execute(board);

    expect(afterResize).toBe(board);
    expect(command.undo(afterResize)).toBe(afterResize);
  });

  it("moves one or more nodes by a world delta and can undo the move", () => {
    const first = createNode("first", 10, 20);
    const second = createNode("second", -5, 30);
    const untouched = createNode("untouched", 100, 100);
    const board = createBoardWithNodes([first, second, untouched]);
    const command = new MoveNodesCommand({
      clock: COMMAND_TIME,
      delta: { x: 12, y: -8 },
      ids: ["first", "second"]
    });

    const afterMove = command.execute(board);

    expect(afterMove.nodes.first?.position).toEqual({ x: 22, y: 12 });
    expect(afterMove.nodes.second?.position).toEqual({ x: 7, y: 22 });
    expect(afterMove.nodes.untouched?.position).toEqual(untouched.position);
    expect(afterMove.updatedAt).toBe(COMMAND_TIME);

    const afterUndo = command.undo(afterMove);

    expect(afterUndo.nodes.first).toEqual(first);
    expect(afterUndo.nodes.second).toEqual(second);
    expect(afterUndo.nodes.untouched).toEqual(untouched);
    expect(afterUndo.updatedAt).toBe(INITIAL_TIME);
  });
});
