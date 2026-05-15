import { describe, expect, it } from "vitest";
import {
  CreateEdgeCommand,
  CreateLinkedTextNodeCommand,
  CreateTextNodeCommand,
  InsertEdgeFixedPointCommand,
  MoveNodesCommand,
  MoveEdgeFixedPointCommand,
  ResizeNodeCommand,
  UpdateEdgeStyleCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../../src/application/commands/boardInteractionCommands";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardEdge, BoardNode, BoardState } from "../../../src/domain/board/types";

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

function createBoardWithEdge(edge: BoardEdge): BoardState {
  const source = createNode("source", 100, 100, "Source");
  const target = createNode("target", 420, 100, "Target");

  return {
    ...createBoardWithNodes([source, target]),
    edges: { [edge.id]: edge },
    selection: { nodeIds: [], edgeIds: [edge.id] }
  };
}

describe("board interaction commands", () => {
  it("estimates text node size from default width and wrapped text height", () => {
    expect(estimateTextNodeSize("Short")).toEqual({
      width: 120,
      height: defaultBoardSettings.textNodeSize.height
    });
    expect(estimateTextNodeSize("Line one\nLine two\nLine three")).toEqual({
      width: 120,
      height: 74
    });
    expect(estimateTextNodeSize("A deliberately longer single line that should widen before wrapping").width).toBeGreaterThan(
      defaultBoardSettings.textNodeSize.width
    );
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

  it("creates a linked text node and default edge, then undoes both", () => {
    const source = createNode("source", 100, 120, "Source");
    const board = createBoardWithNodes([source]);
    const command = new CreateLinkedTextNodeCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-1",
      nodeId: "node-2",
      position: { x: 320, y: 120 },
      sourceNodeId: "source",
      text: ""
    });

    const afterCreate = command.execute(board);

    expect(afterCreate.nodes["node-2"]).toEqual({
      id: "node-2",
      type: "text",
      position: { x: 320, y: 120 },
      size: estimateTextNodeSize(""),
      sizing: "auto",
      text: "",
      style: defaultBoardSettings.textNodeStyle
    });
    expect(afterCreate.edges["edge-1"]).toEqual({
      id: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "node", nodeId: "node-2" },
      fixedPoints: [],
      ...defaultBoardSettings.edgeStyle
    });
    expect(afterCreate.selection).toEqual({ nodeIds: ["node-2"], edgeIds: [] });
    expect(afterCreate.updatedAt).toBe(COMMAND_TIME);

    const afterUndo = command.undo(afterCreate);

    expect(afterUndo.nodes["node-2"]).toBeUndefined();
    expect(afterUndo.edges["edge-1"]).toBeUndefined();
    expect(afterUndo.selection).toEqual(board.selection);
    expect(afterUndo.updatedAt).toBe(INITIAL_TIME);
  });

  it("creates a default edge between endpoints and selects the edge", () => {
    const board = createBoardWithNodes([createNode("source", 0, 0), createNode("target", 220, 0)]);
    const command = new CreateEdgeCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "node", nodeId: "target" }
    });

    const afterCreate = command.execute(board);

    expect(afterCreate.edges["edge-1"]).toEqual({
      id: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "node", nodeId: "target" },
      fixedPoints: [],
      ...defaultBoardSettings.edgeStyle
    });
    expect(afterCreate.selection).toEqual({ nodeIds: [], edgeIds: ["edge-1"] });
  });

  it("clones edge endpoint points and default stroke style", () => {
    const board = createBoardWithNodes([createNode("source", 0, 0)]);
    const targetPoint = { x: 320, y: 140 };
    const first = new CreateEdgeCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "point", point: targetPoint }
    });
    const second = new CreateEdgeCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-2",
      from: { type: "node", nodeId: "source" },
      to: { type: "point", point: { x: 420, y: 180 } }
    });

    const afterCreate = second.execute(first.execute(board));
    targetPoint.x = 999;
    afterCreate.edges["edge-1"]!.stroke.color = "#000000";

    expect(afterCreate.edges["edge-1"]?.to).toEqual({ type: "point", point: { x: 320, y: 140 } });
    expect(afterCreate.edges["edge-2"]?.stroke.color).toBe(defaultBoardSettings.edgeStyle.stroke.color);
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

  it("updates edge style fields and restores the previous edge on undo", () => {
    const board = createBoardWithEdge({
      id: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "node", nodeId: "target" },
      pathType: "bezier",
      arrow: "end",
      stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
      fixedPoints: []
    });
    const command = new UpdateEdgeStyleCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-1",
      patch: {
        pathType: "roundedElbow",
        arrow: "both",
        stroke: { color: "#d14f2f", width: 4, dash: "dashed" }
      }
    });

    const afterUpdate = command.execute(board);

    expect(afterUpdate.edges["edge-1"]).toMatchObject({
      pathType: "roundedElbow",
      arrow: "both",
      stroke: { color: "#d14f2f", width: 4, dash: "dashed" }
    });
    expect(command.undo(afterUpdate).edges["edge-1"]).toEqual(board.edges["edge-1"]);
  });

  it("inserts and moves edge fixed points with undo support", () => {
    const board = createBoardWithEdge({
      id: "edge-1",
      from: { type: "node", nodeId: "source" },
      to: { type: "node", nodeId: "target" },
      pathType: "straight",
      arrow: "end",
      stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
      fixedPoints: [{ x: 180, y: 140 }]
    });

    const insert = new InsertEdgeFixedPointCommand({
      clock: COMMAND_TIME,
      edgeId: "edge-1",
      index: 1,
      point: { x: 240, y: 180 }
    });
    const afterInsert = insert.execute(board);
    expect(afterInsert.edges["edge-1"]?.fixedPoints).toEqual([
      { x: 180, y: 140 },
      { x: 240, y: 180 }
    ]);

    const move = new MoveEdgeFixedPointCommand({
      clock: "2026-05-15T02:00:00.000Z",
      edgeId: "edge-1",
      index: 0,
      point: { x: 190, y: 160 }
    });
    const afterMove = move.execute(afterInsert);
    expect(afterMove.edges["edge-1"]?.fixedPoints[0]).toEqual({ x: 190, y: 160 });
    expect(move.undo(afterMove).edges["edge-1"]).toEqual(afterInsert.edges["edge-1"]);
    expect(insert.undo(afterInsert).edges["edge-1"]).toEqual(board.edges["edge-1"]);
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
