# FreeLinkBoard M4 蓝图式连线核心交互实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 M2 画布骨架和 M3 文本节点交互之上，实现 Tab 相连节点、Ctrl+L 拉线、连线样式工具条和固定点编辑。

**Architecture:** 延续现有 Clean/Hexagonal 边界：可撤销的白板变更继续落在 `src/application/commands` 的纯 `BoardCommand` 中，画布命中、快捷键状态和临时拖拽态留在 renderer。连线路径、命中测试和固定点索引放入 application geometry 层，供 Canvas 渲染和交互共用，避免在 React 组件里散落几何算法。

**Tech Stack:** React, Zustand, TypeScript, Vitest, Testing Library, existing `BoardState`, `HistoryService`, Canvas2D/DOM hybrid renderer.

---

## Scope Check

本计划覆盖 M4：

- `Tab` 从当前选中文本节点右侧寻找附近空位，创建一个新文本节点，并创建从源节点到新节点的默认连线。
- `Ctrl+L` 从当前选中文本节点进入拉线模式；点击另一个节点创建节点到节点连线，点击空白处创建节点到点位连线。
- 默认线使用 `defaultBoardSettings.edgeStyle`：`pathType: "bezier"`、`arrow: "end"`、蓝绿色实线。
- Canvas 连线支持 `straight`、`bezier`、`roundedElbow` 三种路径。
- 连线支持 `arrow: "none" | "end" | "both"`、`dash: "solid" | "dashed"`、颜色和粗细。
- 点击连线选中边，并显示浮动工具条。
- 双击连线在最近线段插入固定点；选中或悬停连线时显示固定点；拖动固定点更新线路。

本计划不覆盖：

- 线文本标签、关系类型、自动避障、多端口锚点、Shift/Ctrl 加选。
- M5 的全局设置页、默认连线设置持久化、删除/复制粘贴补齐。
- M6 的 5,000 节点和 8,000 连线性能验收。

## File Structure

预计新增和修改：

```text
src/
  application/
    commands/
      boardInteractionCommands.ts        # 新增连线相关 BoardCommand
    geometry/
      edgeHitTesting.ts                  # 新增连线路径采样、命中、最近线段索引
      edgePathCache.ts                   # 扩展路径 bounds 和 path key
      linkedNodePlacement.ts             # 新增 Tab 相连节点落位算法
  renderer/
    board/
      BoardCanvas.tsx                    # 快捷键、拉线态、边命中、固定点拖拽
      layers/
        EdgeCanvasLayer.tsx              # 连线路径、箭头、选中态渲染
        EdgeControlLayer.tsx             # 新增工具条和固定点 handle DOM 层
        NodeDomLayer.tsx                 # 支持拉线模式下点击节点作为目标
    stores/
      documentStore.ts                   # 新增 selectEdges/selectBoardItems
tests/
  application/
    commands/
      boardInteractionCommands.test.ts   # 连线命令测试
    geometry/
      edgeHitTesting.test.ts             # 命中与固定点索引测试
      linkedNodePlacement.test.ts        # Tab 落位测试
  renderer/
    board/
      BoardCanvas.interactions.test.tsx  # Tab、Ctrl+L、边选择、工具条、固定点交互
      EdgeCanvasLayer.test.tsx           # Canvas 路径和箭头渲染测试
```

## Task 1: Edge Commands And Selection Store

**Files:**

- Modify: `src/application/commands/boardInteractionCommands.ts`
- Modify: `src/renderer/stores/documentStore.ts`
- Test: `tests/application/commands/boardInteractionCommands.test.ts`
- Test: `tests/renderer/stores/documentStore.test.ts`

- [ ] **Step 1: Write failing command tests**

Add these tests to `tests/application/commands/boardInteractionCommands.test.ts`:

```typescript
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
```

Add small local helpers near the existing test helpers:

```typescript
function createBoardWithEdge(edge: BoardState["edges"][string]): BoardState {
  const source = createNode("source", 100, 100, "Source");
  const target = createNode("target", 420, 100, "Target");
  return {
    ...createBoardWithNodes([source, target]),
    edges: { [edge.id]: edge },
    selection: { nodeIds: [], edgeIds: [edge.id] }
  };
}
```

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts
```

Expected: FAIL because `CreateLinkedTextNodeCommand`, `CreateEdgeCommand`, `UpdateEdgeStyleCommand`, `InsertEdgeFixedPointCommand`, and `MoveEdgeFixedPointCommand` do not exist.

- [ ] **Step 2: Implement pure edge commands**

In `src/application/commands/boardInteractionCommands.ts`, extend the type import:

```typescript
import type {
  BoardEdge,
  BoardNode,
  BoardSelection,
  BoardState,
  EdgeEndpoint,
  EdgeId,
  NodeId,
  Point,
  Size
} from "../../domain/board/types";
```

Add the command input types and classes after `CreateTextNodeCommand`:

```typescript
export type CreateLinkedTextNodeCommandInput = {
  edgeId: EdgeId;
  nodeId: NodeId;
  sourceNodeId: NodeId;
  position: Point;
  text: string;
  clock: string;
};

export class CreateLinkedTextNodeCommand implements BoardCommand {
  readonly name = "create-linked-text-node";

  private previousNode: BoardNode | undefined;
  private previousEdge: BoardEdge | undefined;
  private previousSelection: BoardSelection | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: CreateLinkedTextNodeCommandInput) {}

  execute(state: BoardState): BoardState {
    const sourceNode = state.nodes[this.input.sourceNodeId];
    if (!sourceNode) {
      return state;
    }

    this.previousNode = state.nodes[this.input.nodeId];
    this.previousEdge = state.edges[this.input.edgeId];
    this.previousSelection = cloneSelection(state.selection);
    this.previousUpdatedAt = state.updatedAt;

    const node: BoardNode = {
      id: this.input.nodeId,
      type: "text",
      position: { ...this.input.position },
      size: estimateTextNodeSize(this.input.text),
      sizing: "auto",
      text: this.input.text,
      style: { ...defaultBoardSettings.textNodeStyle }
    };
    const edge: BoardEdge = createDefaultEdge(
      this.input.edgeId,
      { type: "node", nodeId: this.input.sourceNodeId },
      { type: "node", nodeId: this.input.nodeId }
    );

    return {
      ...state,
      nodes: { ...state.nodes, [node.id]: node },
      edges: { ...state.edges, [edge.id]: edge },
      selection: { nodeIds: [node.id], edgeIds: [] },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    const { [this.input.nodeId]: removedNode, ...remainingNodes } = state.nodes;
    const { [this.input.edgeId]: removedEdge, ...remainingEdges } = state.edges;
    void removedNode;
    void removedEdge;

    return {
      ...state,
      nodes: this.previousNode
        ? { ...remainingNodes, [this.previousNode.id]: this.previousNode }
        : remainingNodes,
      edges: this.previousEdge
        ? { ...remainingEdges, [this.previousEdge.id]: this.previousEdge }
        : remainingEdges,
      selection: this.previousSelection ?? state.selection,
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type CreateEdgeCommandInput = {
  edgeId: EdgeId;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  clock: string;
};

export class CreateEdgeCommand implements BoardCommand {
  readonly name = "create-edge";

  private previousEdge: BoardEdge | undefined;
  private previousSelection: BoardSelection | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: CreateEdgeCommandInput) {}

  execute(state: BoardState): BoardState {
    this.previousEdge = state.edges[this.input.edgeId];
    this.previousSelection = cloneSelection(state.selection);
    this.previousUpdatedAt = state.updatedAt;

    const edge = createDefaultEdge(this.input.edgeId, this.input.from, this.input.to);

    return {
      ...state,
      edges: { ...state.edges, [edge.id]: edge },
      selection: { nodeIds: [], edgeIds: [edge.id] },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    const { [this.input.edgeId]: removedEdge, ...remainingEdges } = state.edges;
    void removedEdge;

    return {
      ...state,
      edges: this.previousEdge
        ? { ...remainingEdges, [this.previousEdge.id]: this.previousEdge }
        : remainingEdges,
      selection: this.previousSelection ?? state.selection,
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}
```

Add style and fixed-point commands near `ResizeNodeCommand`:

```typescript
export type UpdateEdgeStyleCommandInput = {
  edgeId: EdgeId;
  patch: Partial<Pick<BoardEdge, "pathType" | "arrow">> & {
    stroke?: Partial<BoardEdge["stroke"]>;
  };
  clock: string;
};

export class UpdateEdgeStyleCommand implements BoardCommand {
  readonly name = "update-edge-style";

  private previousEdge: BoardEdge | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: UpdateEdgeStyleCommandInput) {}

  execute(state: BoardState): BoardState {
    const edge = state.edges[this.input.edgeId];
    if (!edge) {
      return state;
    }

    this.previousEdge = edge;
    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      edges: {
        ...state.edges,
        [edge.id]: {
          ...edge,
          ...this.input.patch,
          stroke: {
            ...edge.stroke,
            ...this.input.patch.stroke
          }
        }
      },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.previousEdge) {
      return state;
    }

    return {
      ...state,
      edges: { ...state.edges, [this.previousEdge.id]: this.previousEdge },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type InsertEdgeFixedPointCommandInput = {
  edgeId: EdgeId;
  index: number;
  point: Point;
  clock: string;
};

export class InsertEdgeFixedPointCommand implements BoardCommand {
  readonly name = "insert-edge-fixed-point";

  private previousEdge: BoardEdge | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: InsertEdgeFixedPointCommandInput) {}

  execute(state: BoardState): BoardState {
    const edge = state.edges[this.input.edgeId];
    if (!edge) {
      return state;
    }

    this.previousEdge = edge;
    this.previousUpdatedAt = state.updatedAt;
    const index = clamp(this.input.index, 0, edge.fixedPoints.length);
    const fixedPoints = [...edge.fixedPoints];
    fixedPoints.splice(index, 0, { ...this.input.point });

    return {
      ...state,
      edges: { ...state.edges, [edge.id]: { ...edge, fixedPoints } },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.previousEdge) {
      return state;
    }

    return {
      ...state,
      edges: { ...state.edges, [this.previousEdge.id]: this.previousEdge },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type MoveEdgeFixedPointCommandInput = {
  edgeId: EdgeId;
  index: number;
  point: Point;
  clock: string;
};

export class MoveEdgeFixedPointCommand implements BoardCommand {
  readonly name = "move-edge-fixed-point";

  private previousEdge: BoardEdge | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: MoveEdgeFixedPointCommandInput) {}

  execute(state: BoardState): BoardState {
    const edge = state.edges[this.input.edgeId];
    if (!edge || !edge.fixedPoints[this.input.index]) {
      return state;
    }

    this.previousEdge = edge;
    this.previousUpdatedAt = state.updatedAt;
    const fixedPoints = edge.fixedPoints.map((point, index) =>
      index === this.input.index ? { ...this.input.point } : point
    );

    return {
      ...state,
      edges: { ...state.edges, [edge.id]: { ...edge, fixedPoints } },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.previousEdge) {
      return state;
    }

    return {
      ...state,
      edges: { ...state.edges, [this.previousEdge.id]: this.previousEdge },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}
```

Add the helper before `cloneSelection`:

```typescript
function createDefaultEdge(edgeId: EdgeId, from: EdgeEndpoint, to: EdgeEndpoint): BoardEdge {
  return {
    id: edgeId,
    from,
    to,
    fixedPoints: [],
    ...defaultBoardSettings.edgeStyle
  };
}
```

- [ ] **Step 3: Verify command tests**

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing selection store tests**

Add these tests to `tests/renderer/stores/documentStore.test.ts`:

```typescript
it("selects edges without marking the board dirty", () => {
  const board = createBoardWithEdge("edge-1");
  resetStore(board, "saved");

  useDocumentStore.getState().selectEdges(["edge-1"]);

  expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
    nodeIds: [],
    edgeIds: ["edge-1"]
  });
  expect(useDocumentStore.getState().saveStatus).toBe("saved");
});

it("selects nodes and edges together without creating history", () => {
  const board = createBoardWithEdge("edge-1");
  resetStore(board, "saved");

  useDocumentStore.getState().selectBoardItems({ nodeIds: ["source"], edgeIds: ["edge-1"] });
  fireUndoKeyboardShortcut();

  expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
    nodeIds: ["source"],
    edgeIds: ["edge-1"]
  });
  expect(useDocumentStore.getState().saveStatus).toBe("saved");
});
```

Use existing store-test patterns for `resetStore`. Add this helper if the file does not already have an edge helper:

```typescript
function createBoardWithEdge(edgeId: string): BoardState {
  const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
  return {
    ...board,
    nodes: {
      source: createTextNode("source", 100, 100),
      target: createTextNode("target", 360, 100)
    },
    edges: {
      [edgeId]: {
        id: edgeId,
        from: { type: "node", nodeId: "source" },
        to: { type: "node", nodeId: "target" },
        fixedPoints: [],
        ...defaultBoardSettings.edgeStyle
      }
    }
  };
}
```

Run:

```bash
npm.cmd test -- tests/renderer/stores/documentStore.test.ts
```

Expected: FAIL because `selectEdges` and `selectBoardItems` do not exist.

- [ ] **Step 5: Implement selection APIs**

In `src/renderer/stores/documentStore.ts`, import `BoardSelection`:

```typescript
import type { BoardSelection, BoardState } from "../../domain/board/types";
```

Extend `DocumentStore`:

```typescript
selectEdges(edgeIds: string[]): void;
selectBoardItems(selection: BoardSelection): void;
```

Replace `selectNodes` and add the new methods:

```typescript
selectNodes(nodeIds: string[]) {
  get().selectBoardItems({ nodeIds, edgeIds: [] });
},

selectEdges(edgeIds: string[]) {
  get().selectBoardItems({ nodeIds: [], edgeIds });
},

selectBoardItems(selection: BoardSelection) {
  const currentBoard = get().currentBoard;
  if (!currentBoard) return;

  const nextBoard = {
    ...currentBoard,
    selection: {
      nodeIds: [...selection.nodeIds],
      edgeIds: [...selection.edgeIds]
    }
  };
  boardHistory?.replaceCurrent(nextBoard);
  set({ currentBoard: nextBoard });
}
```

- [ ] **Step 6: Verify store tests**

Run:

```bash
npm.cmd test -- tests/renderer/stores/documentStore.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/application/commands/boardInteractionCommands.ts src/renderer/stores/documentStore.ts tests/application/commands/boardInteractionCommands.test.ts tests/renderer/stores/documentStore.test.ts
git commit -m "feat: add edge commands and selection APIs"
```

## Task 2: Edge Geometry, Hit Testing, And Tab Placement

**Files:**

- Create: `src/application/geometry/edgeHitTesting.ts`
- Create: `src/application/geometry/linkedNodePlacement.ts`
- Modify: `src/application/geometry/edgePathCache.ts`
- Test: `tests/application/geometry/edgeHitTesting.test.ts`
- Test: `tests/application/geometry/linkedNodePlacement.test.ts`
- Test: `tests/application/geometry/edgePathCache.test.ts`

- [ ] **Step 1: Write failing linked-node placement tests**

Create `tests/application/geometry/linkedNodePlacement.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findLinkedNodePosition } from "../../../src/application/geometry/linkedNodePlacement";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardNode } from "../../../src/domain/board/types";

const createNode = (id: string, x: number, y: number): BoardNode => ({
  id,
  type: "text",
  position: { x, y },
  size: defaultBoardSettings.textNodeSize,
  sizing: "auto",
  text: id,
  style: defaultBoardSettings.textNodeStyle
});

describe("linked node placement", () => {
  it("places the linked node to the right of the source by default", () => {
    const source = createNode("source", 100, 120);

    expect(findLinkedNodePosition(source, { source })).toEqual({ x: 320, y: 120 });
  });

  it("moves downward when the preferred right slot intersects another node", () => {
    const source = createNode("source", 100, 120);
    const blocker = createNode("blocker", 310, 110);

    expect(findLinkedNodePosition(source, { source, blocker })).toEqual({ x: 320, y: 208 });
  });
});
```

Run:

```bash
npm.cmd test -- tests/application/geometry/linkedNodePlacement.test.ts
```

Expected: FAIL because `linkedNodePlacement.ts` does not exist.

- [ ] **Step 2: Implement linked-node placement**

Create `src/application/geometry/linkedNodePlacement.ts`:

```typescript
import type { BoardNode, Point } from "../../domain/board/types";
import { boundsIntersect, type Bounds } from "./bounds";

const HORIZONTAL_GAP = 60;
const VERTICAL_STEP = 88;
const MAX_ATTEMPTS = 16;

export function findLinkedNodePosition(source: BoardNode, nodes: Record<string, BoardNode>): Point {
  const preferredX = source.position.x + source.size.width + HORIZONTAL_GAP;
  const preferredY = source.position.y;
  const candidateSize = source.size;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const yOffset = attempt === 0 ? 0 : Math.ceil(attempt / 2) * VERTICAL_STEP * (attempt % 2 === 0 ? -1 : 1);
    const candidate = { x: preferredX, y: preferredY + yOffset };
    const candidateBounds = {
      x: candidate.x,
      y: candidate.y,
      width: candidateSize.width,
      height: candidateSize.height
    };

    if (!intersectsAnyNode(candidateBounds, nodes, source.id)) {
      return candidate;
    }
  }

  return { x: preferredX, y: preferredY + VERTICAL_STEP * MAX_ATTEMPTS };
}

function intersectsAnyNode(candidate: Bounds, nodes: Record<string, BoardNode>, sourceId: string): boolean {
  return Object.values(nodes).some((node) => {
    if (node.id === sourceId) {
      return false;
    }

    return boundsIntersect(candidate, {
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height
    });
  });
}
```

- [ ] **Step 3: Verify linked-node placement**

Run:

```bash
npm.cmd test -- tests/application/geometry/linkedNodePlacement.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing edge hit-testing tests**

Create `tests/application/geometry/edgeHitTesting.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  approximateEdgePathPoints,
  findNearestSegmentInsertionIndex,
  hitTestEdges
} from "../../../src/application/geometry/edgeHitTesting";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";

const nodes: Record<string, BoardNode> = {
  source: {
    id: "source",
    type: "text",
    position: { x: 100, y: 100 },
    size: { width: 160, height: 56 },
    sizing: "fixed",
    text: "Source",
    style: defaultBoardSettings.textNodeStyle
  },
  target: {
    id: "target",
    type: "text",
    position: { x: 420, y: 120 },
    size: { width: 160, height: 56 },
    sizing: "fixed",
    text: "Target",
    style: defaultBoardSettings.textNodeStyle
  }
};

const createEdge = (pathType: BoardEdge["pathType"]): BoardEdge => ({
  id: `edge-${pathType}`,
  from: { type: "node", nodeId: "source" },
  to: { type: "node", nodeId: "target" },
  fixedPoints: [],
  pathType,
  arrow: "end",
  stroke: { color: "#2f6f6a", width: 2, dash: "solid" }
});

describe("edge hit testing", () => {
  it("samples straight, bezier, and rounded elbow paths for hit testing", () => {
    expect(approximateEdgePathPoints(createEdge("straight"), nodes)).toEqual([
      { x: 260, y: 128 },
      { x: 500, y: 148 }
    ]);
    expect(approximateEdgePathPoints(createEdge("bezier"), nodes).length).toBeGreaterThan(8);
    expect(approximateEdgePathPoints(createEdge("roundedElbow"), nodes)).toContainEqual({ x: 380, y: 128 });
  });

  it("finds the nearest edge within screen tolerance", () => {
    const hit = hitTestEdges([createEdge("straight")], nodes, { x: 380, y: 138 }, { x: 0, y: 0, zoom: 1 }, 10);

    expect(hit?.edgeId).toBe("edge-straight");
    expect(hit?.worldPoint).toEqual({ x: 380, y: 138 });
  });

  it("returns insertion index after the nearest segment start", () => {
    const edge = {
      ...createEdge("straight"),
      fixedPoints: [{ x: 320, y: 180 }]
    };
    const points = approximateEdgePathPoints(edge, nodes);

    expect(findNearestSegmentInsertionIndex(points, { x: 360, y: 170 })).toBe(1);
  });
});
```

Run:

```bash
npm.cmd test -- tests/application/geometry/edgeHitTesting.test.ts
```

Expected: FAIL because `edgeHitTesting.ts` does not exist.

- [ ] **Step 5: Implement edge hit testing**

Create `src/application/geometry/edgeHitTesting.ts`:

```typescript
import type { BoardEdge, BoardNode, Point, Viewport } from "../../domain/board/types";
import { resolveEdgeEndpoint } from "./edgePathCache";
import { screenToWorld } from "./viewportTransform";

export type EdgeHit = {
  edgeId: string;
  worldPoint: Point;
  insertionIndex: number;
  distance: number;
};

export function approximateEdgePathPoints(edge: BoardEdge, nodes: Record<string, BoardNode>): Point[] {
  const anchors = [
    resolveEdgeEndpoint(edge.from, nodes),
    ...edge.fixedPoints,
    resolveEdgeEndpoint(edge.to, nodes)
  ];

  if (edge.pathType === "straight") {
    return anchors;
  }

  if (edge.pathType === "roundedElbow") {
    return createRoundedElbowPolyline(anchors);
  }

  return sampleBezierPolyline(anchors);
}

export function hitTestEdges(
  edges: BoardEdge[],
  nodes: Record<string, BoardNode>,
  screenPoint: Point,
  viewport: Viewport,
  screenTolerance = 8
): EdgeHit | null {
  const worldPoint = screenToWorld(screenPoint, viewport);
  const worldTolerance = screenTolerance / viewport.zoom;
  let closest: EdgeHit | null = null;

  for (const edge of edges) {
    const points = approximateEdgePathPoints(edge, nodes);
    const distance = distanceToPolyline(points, worldPoint);
    if (distance > worldTolerance) {
      continue;
    }

    if (!closest || distance < closest.distance) {
      closest = {
        edgeId: edge.id,
        worldPoint,
        insertionIndex: findNearestSegmentInsertionIndex(points, worldPoint),
        distance
      };
    }
  }

  return closest;
}

export function findNearestSegmentInsertionIndex(points: Point[], point: Point): number {
  if (points.length < 2) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(point, points[index]!, points[index + 1]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function createRoundedElbowPolyline(anchors: Point[]): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const midX = start.x + (end.x - start.x) / 2;
    if (index === 0) {
      result.push(start);
    }
    result.push({ x: midX, y: start.y }, { x: midX, y: end.y }, end);
  }
  return result;
}

function sampleBezierPolyline(anchors: Point[]): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index]!;
    const end = anchors[index + 1]!;
    const distance = Math.max(40, Math.abs(end.x - start.x) * 0.45);
    const controlA = { x: start.x + distance, y: start.y };
    const controlB = { x: end.x - distance, y: end.y };
    const samples = 12;

    for (let sample = 0; sample <= samples; sample += 1) {
      if (index > 0 && sample === 0) {
        continue;
      }
      const t = sample / samples;
      result.push(cubicPoint(start, controlA, controlB, end, t));
    }
  }
  return result;
}

function cubicPoint(start: Point, controlA: Point, controlB: Point, end: Point, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * controlA.x + 3 * mt * t ** 2 * controlB.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * controlA.y + 3 * mt * t ** 2 * controlB.y + t ** 3 * end.y
  };
}

function distanceToPolyline(points: Point[], point: Point): number {
  if (points.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(
    ...points.slice(0, -1).map((start, index) => distanceToSegment(point, start, points[index + 1]!))
  );
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}
```

- [ ] **Step 6: Extend edge path cache bounds**

Update `src/application/geometry/edgePathCache.ts` so bounds include a small padding for curved paths and style key changes that affect geometry:

```typescript
function getPointsBounds(points: Point[]): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 32;

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  };
}
```

Update `tests/application/geometry/edgePathCache.test.ts` expected bounds for the existing deterministic path:

```typescript
bounds: { x: 148, y: 98, width: 344, height: 194 }
```

Run:

```bash
npm.cmd test -- tests/application/geometry/edgePathCache.test.ts tests/application/geometry/edgeHitTesting.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/application/geometry/edgeHitTesting.ts src/application/geometry/linkedNodePlacement.ts src/application/geometry/edgePathCache.ts tests/application/geometry/edgeHitTesting.test.ts tests/application/geometry/linkedNodePlacement.test.ts tests/application/geometry/edgePathCache.test.ts
git commit -m "feat: add edge geometry and hit testing"
```

## Task 3: Canvas Edge Rendering

**Files:**

- Modify: `src/renderer/board/layers/EdgeCanvasLayer.tsx`
- Test: `tests/renderer/board/EdgeCanvasLayer.test.tsx`

- [ ] **Step 1: Write failing Canvas rendering tests**

Create `tests/renderer/board/EdgeCanvasLayer.test.tsx`:

```typescript
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeCanvasLayer } from "../../../src/renderer/board/layers/EdgeCanvasLayer";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardEdge, BoardNode } from "../../../src/domain/board/types";

const context = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  lineCap: "",
  lineJoin: "",
  lineWidth: 0,
  strokeStyle: ""
};

const nodes: Record<string, BoardNode> = {
  source: {
    id: "source",
    type: "text",
    position: { x: 100, y: 100 },
    size: { width: 160, height: 56 },
    sizing: "fixed",
    text: "Source",
    style: defaultBoardSettings.textNodeStyle
  },
  target: {
    id: "target",
    type: "text",
    position: { x: 420, y: 120 },
    size: { width: 160, height: 56 },
    sizing: "fixed",
    text: "Target",
    style: defaultBoardSettings.textNodeStyle
  }
};

const edge = (pathType: BoardEdge["pathType"], arrow: BoardEdge["arrow"] = "end"): BoardEdge => ({
  id: `edge-${pathType}`,
  from: { type: "node", nodeId: "source" },
  to: { type: "node", nodeId: "target" },
  pathType,
  arrow,
  stroke: { color: "#2f6f6a", width: 3, dash: "dashed" },
  fixedPoints: []
});

describe("EdgeCanvasLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => context as unknown as CanvasRenderingContext2D)
    });
  });

  it("draws dashed bezier edges with arrowheads", () => {
    render(
      <EdgeCanvasLayer
        edges={[edge("bezier")]}
        nodes={nodes}
        selectedEdgeIds={[]}
        size={{ width: 640, height: 360 }}
        viewport={{ x: 0, y: 0, zoom: 1 }}
      />
    );

    expect(context.setLineDash).toHaveBeenCalledWith([8, 8]);
    expect(context.bezierCurveTo).toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalled();
    expect(context.strokeStyle).toBe("#2f6f6a");
    expect(context.lineWidth).toBe(3);
  });

  it("draws selected straight edges with a wider hit-visible stroke", () => {
    render(
      <EdgeCanvasLayer
        edges={[edge("straight", "both")]}
        nodes={nodes}
        selectedEdgeIds={["edge-straight"]}
        size={{ width: 640, height: 360 }}
        viewport={{ x: 0, y: 0, zoom: 1 }}
      />
    );

    expect(context.lineTo).toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalledTimes(2);
    expect(context.lineWidth).toBeGreaterThan(3);
  });

  it("draws rounded elbow edges with quadratic corners", () => {
    render(
      <EdgeCanvasLayer
        edges={[edge("roundedElbow")]}
        nodes={nodes}
        selectedEdgeIds={[]}
        size={{ width: 640, height: 360 }}
        viewport={{ x: 0, y: 0, zoom: 1 }}
      />
    );

    expect(context.quadraticCurveTo).toHaveBeenCalled();
  });
});
```

Run:

```bash
npm.cmd test -- tests/renderer/board/EdgeCanvasLayer.test.tsx
```

Expected: FAIL because `selectedEdgeIds` and curve/arrow rendering do not exist.

- [ ] **Step 2: Implement Canvas path rendering**

In `src/renderer/board/layers/EdgeCanvasLayer.tsx`, add `selectedEdgeIds`:

```typescript
export type EdgeCanvasLayerProps = {
  edges: BoardEdge[];
  nodes: Record<string, BoardNode>;
  viewport: Viewport;
  size: Size;
  selectedEdgeIds?: string[];
  onVisibleEdgeCountChange?: (count: number) => void;
};
```

Import helpers:

```typescript
import { approximateEdgePathPoints } from "../../../application/geometry/edgeHitTesting";
```

Inside the render effect, replace the line-only drawing loop with:

```typescript
for (const { edge, path } of visiblePaths) {
  const points = path.points;
  if (points.length < 2) {
    continue;
  }

  const selected = selectedEdgeIds.includes(edge.id);
  context.save();
  context.strokeStyle = edge.stroke.color;
  context.fillStyle = edge.stroke.color;
  context.lineWidth = selected ? edge.stroke.width + 2 : edge.stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(edge.stroke.dash === "dashed" ? [8, 8] : []);
  drawEdgePath(context, edge, points, viewport);
  context.stroke();
  context.setLineDash([]);
  drawArrowheads(context, edge, approximateEdgePathPoints(edge, nodes), viewport);
  context.restore();
}
```

Add helpers at the bottom of the file:

```typescript
function drawEdgePath(
  context: CanvasRenderingContext2D,
  edge: BoardEdge,
  points: Point[],
  viewport: Viewport
): void {
  const first = worldToScreen(points[0]!, viewport);
  context.beginPath();
  context.moveTo(first.x, first.y);

  if (edge.pathType === "bezier") {
    drawBezierSegments(context, points, viewport);
    return;
  }

  if (edge.pathType === "roundedElbow") {
    drawRoundedElbowSegments(context, points, viewport);
    return;
  }

  for (const point of points.slice(1)) {
    const screenPoint = worldToScreen(point, viewport);
    context.lineTo(screenPoint.x, screenPoint.y);
  }
}

function drawBezierSegments(context: CanvasRenderingContext2D, points: Point[], viewport: Viewport): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const distance = Math.max(40, Math.abs(end.x - start.x) * 0.45);
    const controlA = worldToScreen({ x: start.x + distance, y: start.y }, viewport);
    const controlB = worldToScreen({ x: end.x - distance, y: end.y }, viewport);
    const screenEnd = worldToScreen(end, viewport);
    context.bezierCurveTo(controlA.x, controlA.y, controlB.x, controlB.y, screenEnd.x, screenEnd.y);
  }
}

function drawRoundedElbowSegments(context: CanvasRenderingContext2D, points: Point[], viewport: Viewport): void {
  const radius = 14;
  const elbowPoints: Point[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const midX = start.x + (end.x - start.x) / 2;
    if (index === 0) {
      elbowPoints.push(start);
    }
    elbowPoints.push({ x: midX, y: start.y }, { x: midX, y: end.y }, end);
  }

  for (let index = 1; index < elbowPoints.length; index += 1) {
    const previous = elbowPoints[index - 1]!;
    const current = elbowPoints[index]!;
    const next = elbowPoints[index + 1];
    if (!next) {
      const screenPoint = worldToScreen(current, viewport);
      context.lineTo(screenPoint.x, screenPoint.y);
      continue;
    }

    const before = shortenToward(current, previous, radius);
    const after = shortenToward(current, next, radius);
    const screenBefore = worldToScreen(before, viewport);
    const screenCurrent = worldToScreen(current, viewport);
    const screenAfter = worldToScreen(after, viewport);
    context.lineTo(screenBefore.x, screenBefore.y);
    context.quadraticCurveTo(screenCurrent.x, screenCurrent.y, screenAfter.x, screenAfter.y);
  }
}

function drawArrowheads(
  context: CanvasRenderingContext2D,
  edge: BoardEdge,
  points: Point[],
  viewport: Viewport
): void {
  if (edge.arrow === "none" || points.length < 2) {
    return;
  }

  if (edge.arrow === "end" || edge.arrow === "both") {
    drawArrowhead(context, points[points.length - 2]!, points[points.length - 1]!, viewport);
  }

  if (edge.arrow === "both") {
    drawArrowhead(context, points[1]!, points[0]!, viewport);
  }
}

function drawArrowhead(context: CanvasRenderingContext2D, from: Point, to: Point, viewport: Viewport): void {
  const start = worldToScreen(from, viewport);
  const end = worldToScreen(to, viewport);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = 12;

  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - length * Math.cos(angle - Math.PI / 6), end.y - length * Math.sin(angle - Math.PI / 6));
  context.lineTo(end.x - length * Math.cos(angle + Math.PI / 6), end.y - length * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function shortenToward(point: Point, toward: Point, amount: number): Point {
  const dx = toward.x - point.x;
  const dy = toward.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return point;
  }

  return {
    x: point.x + (dx / length) * Math.min(amount, length / 2),
    y: point.y + (dy / length) * Math.min(amount, length / 2)
  };
}
```

Pass `selectedEdgeIds={board.selection.edgeIds}` from `BoardCanvas`.

- [ ] **Step 3: Verify Canvas rendering tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/EdgeCanvasLayer.test.tsx tests/renderer/board/BoardCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit Task 3**

```bash
git add src/renderer/board/layers/EdgeCanvasLayer.tsx src/renderer/board/BoardCanvas.tsx tests/renderer/board/EdgeCanvasLayer.test.tsx
git commit -m "feat: render styled blueprint edges"
```

## Task 4: Tab Linked Nodes And Ctrl+L Edge Creation

**Files:**

- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/NodeDomLayer.tsx`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add these tests to `tests/renderer/board/BoardCanvas.interactions.test.tsx`:

```typescript
it("creates a linked editable node with Tab from the selected node", () => {
  resetStore({
    ...createBoardWithNode(),
    selection: { nodeIds: ["node_1"], edgeIds: [] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.keyDown(window, { code: "Tab" });

  const board = useDocumentStore.getState().currentBoard;
  const createdNodeId = Object.keys(board?.nodes ?? {}).find((id) => id !== "node_1");
  const createdEdge = Object.values(board?.edges ?? {})[0];

  expect(createdNodeId).toBe("node_stable-node");
  expect(board?.nodes["node_stable-node"]?.position).toEqual({ x: 320, y: 120 });
  expect(createdEdge).toMatchObject({
    from: { type: "node", nodeId: "node_1" },
    to: { type: "node", nodeId: "node_stable-node" },
    pathType: "bezier",
    arrow: "end"
  });
  expect(screen.getByRole("textbox")).toHaveFocus();
});

it("creates an edge from the selected node to a clicked node after Ctrl+L", () => {
  resetStore({
    ...createBoardWithNodes([
      {
        id: "node_1",
        type: "text",
        position: { x: 100, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Source",
        style: defaultBoardSettings.textNodeStyle
      },
      {
        id: "node_2",
        type: "text",
        position: { x: 360, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Target",
        style: defaultBoardSettings.textNodeStyle
      }
    ]),
    selection: { nodeIds: ["node_1"], edgeIds: [] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.keyDown(window, { code: "KeyL", ctrlKey: true });
  fireEvent.click(screen.getByTestId("board-node-node_2"));

  const edge = Object.values(useDocumentStore.getState().currentBoard?.edges ?? {})[0];
  expect(edge).toMatchObject({
    from: { type: "node", nodeId: "node_1" },
    to: { type: "node", nodeId: "node_2" }
  });
  expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
    nodeIds: [],
    edgeIds: [edge?.id]
  });
});

it("creates an edge from the selected node to a blank point after Ctrl+L", () => {
  resetStore({
    ...createBoardWithNode(),
    selection: { nodeIds: ["node_1"], edgeIds: [] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.keyDown(window, { code: "KeyL", ctrlKey: true });
  fireEvent.pointerDown(screen.getByTestId("board-canvas"), { button: 0, clientX: 380, clientY: 220, pointerId: 1 });
  fireEvent.pointerUp(screen.getByTestId("board-canvas"), { button: 0, clientX: 380, clientY: 220, pointerId: 1 });

  const edge = Object.values(useDocumentStore.getState().currentBoard?.edges ?? {})[0];
  expect(edge).toMatchObject({
    from: { type: "node", nodeId: "node_1" },
    to: { type: "point", point: { x: 380, y: 220 } }
  });
});

it("cancels edge creation with Escape", () => {
  resetStore({
    ...createBoardWithNode(),
    selection: { nodeIds: ["node_1"], edgeIds: [] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.keyDown(window, { code: "KeyL", ctrlKey: true });
  fireEvent.keyDown(window, { code: "Escape" });
  fireEvent.pointerDown(screen.getByTestId("board-canvas"), { button: 0, clientX: 380, clientY: 220, pointerId: 1 });
  fireEvent.pointerUp(screen.getByTestId("board-canvas"), { button: 0, clientX: 380, clientY: 220, pointerId: 1 });

  expect(useDocumentStore.getState().currentBoard?.edges).toEqual({});
});
```

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL because M4 keyboard creation behavior does not exist.

- [ ] **Step 2: Implement keyboard state and commands in BoardCanvas**

In `BoardCanvas.tsx`, import the new commands and geometry:

```typescript
import {
  CreateEdgeCommand,
  CreateLinkedTextNodeCommand,
  CreateTextNodeCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../application/commands/boardInteractionCommands";
import { findLinkedNodePosition } from "../../application/geometry/linkedNodePlacement";
import type { EdgeEndpoint, EdgeId } from "../../domain/board/types";
```

Add state:

```typescript
type EdgeCreationState = {
  from: EdgeEndpoint;
};

const [edgeCreation, setEdgeCreation] = useState<EdgeCreationState | null>(null);
```

Add helpers inside `BoardCanvas`:

```typescript
const createEdgeId = (): EdgeId => `edge_${nanoid()}`;
const createNodeId = (): NodeId => `node_${nanoid()}`;

const getSingleSelectedNode = (): BoardNode | null => {
  const selectedNodeId = board.selection.nodeIds[0];
  if (board.selection.nodeIds.length !== 1 || !selectedNodeId) {
    return null;
  }

  return board.nodes[selectedNodeId] ?? null;
};

const createLinkedNodeFromSelection = (): void => {
  const sourceNode = getSingleSelectedNode();
  if (!sourceNode) {
    return;
  }

  const nodeId = createNodeId();
  runBoardCommand(
    new CreateLinkedTextNodeCommand({
      clock: new Date().toISOString(),
      edgeId: createEdgeId(),
      nodeId,
      position: findLinkedNodePosition(sourceNode, board.nodes),
      sourceNodeId: sourceNode.id,
      text: ""
    })
  );
  setEditingNodeId(nodeId);
  setEditingDraft({ nodeId, text: "" });
};

const startEdgeCreationFromSelection = (): void => {
  const sourceNode = getSingleSelectedNode();
  if (!sourceNode) {
    return;
  }

  setEditingNodeId(null);
  setEditingDraft(null);
  setEdgeCreation({ from: { type: "node", nodeId: sourceNode.id } });
};

const finishEdgeCreation = (to: EdgeEndpoint): boolean => {
  if (!edgeCreation) {
    return false;
  }

  runBoardCommand(
    new CreateEdgeCommand({
      clock: new Date().toISOString(),
      edgeId: createEdgeId(),
      from: edgeCreation.from,
      to
    })
  );
  setEdgeCreation(null);
  return true;
};
```

Extend the keydown effect:

```typescript
if (event.code === "Escape") {
  setEdgeCreation(null);
  setEditingNodeId(null);
  setEditingDraft(null);
}

if (event.code === "Tab" && !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) {
  event.preventDefault();
  createLinkedNodeFromSelection();
}

if (event.code === "KeyL" && (event.ctrlKey || event.metaKey)) {
  event.preventDefault();
  startEdgeCreationFromSelection();
}
```

Add `createLinkedNodeFromSelection` and `startEdgeCreationFromSelection` to the effect dependencies.

- [ ] **Step 3: Wire node and blank clicks to edge creation**

Update `selectNode`:

```typescript
const selectNode = (nodeId: NodeId): void => {
  if (finishEdgeCreation({ type: "node", nodeId })) {
    return;
  }

  if (suppressNextNodeClickRef.current) {
    suppressNextNodeClickRef.current = false;
    return;
  }

  selectNodes([nodeId]);
};
```

At the start of `finishSelectionBox`, before clearing selection:

```typescript
if (edgeCreation) {
  const endScreenPoint = getLocalScreenPoint(event);
  if (screenDistance(selectionState.startScreenPoint, endScreenPoint) < POINTER_DRAG_THRESHOLD) {
    finishEdgeCreation({ type: "point", point: screenToWorld(endScreenPoint, viewport) });
    selectionBoxRef.current = null;
    setSelectionBox(null);
    return;
  }
}
```

Leave drag selection unchanged when movement passes the threshold.

- [ ] **Step 4: Verify keyboard creation tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS for new M4 creation tests and existing M3 tests.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/renderer/board/BoardCanvas.tsx src/renderer/board/layers/NodeDomLayer.tsx tests/renderer/board/BoardCanvas.interactions.test.tsx
git commit -m "feat: create linked nodes and edges from keyboard"
```

## Task 5: Edge Selection And Floating Toolbar

**Files:**

- Create: `src/renderer/board/layers/EdgeControlLayer.tsx`
- Modify: `src/renderer/board/BoardCanvas.tsx`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`

- [ ] **Step 1: Write failing toolbar tests**

Add these tests to `tests/renderer/board/BoardCanvas.interactions.test.tsx`:

```typescript
it("selects an edge by clicking near the rendered path", () => {
  resetStore(createBoardWithEdge("edge_1"));
  render(<StoreConnectedBoard />);

  fireEvent.pointerDown(screen.getByTestId("board-canvas"), { button: 0, clientX: 340, clientY: 148, pointerId: 1 });
  fireEvent.pointerUp(screen.getByTestId("board-canvas"), { button: 0, clientX: 340, clientY: 148, pointerId: 1 });

  expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
    nodeIds: [],
    edgeIds: ["edge_1"]
  });
  expect(screen.getByTestId("edge-floating-toolbar-edge_1")).toBeInTheDocument();
});

it("updates selected edge style from the floating toolbar", () => {
  resetStore({
    ...createBoardWithEdge("edge_1"),
    selection: { nodeIds: [], edgeIds: ["edge_1"] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.click(screen.getByTestId("edge-path-roundedElbow-edge_1"));
  fireEvent.click(screen.getByTestId("edge-arrow-both-edge_1"));
  fireEvent.click(screen.getByTestId("edge-dash-dashed-edge_1"));
  fireEvent.change(screen.getByTestId("edge-color-edge_1"), { target: { value: "#d14f2f" } });
  fireEvent.change(screen.getByTestId("edge-width-edge_1"), { target: { value: "4" } });

  expect(useDocumentStore.getState().currentBoard?.edges.edge_1).toMatchObject({
    pathType: "roundedElbow",
    arrow: "both",
    stroke: { color: "#d14f2f", width: 4, dash: "dashed" }
  });
  expect(useDocumentStore.getState().saveStatus).toBe("dirty");
});
```

Add a renderer test helper:

```typescript
function createBoardWithEdge(edgeId: string): BoardState {
  return {
    ...createBoardWithNodes([
      {
        id: "node_1",
        type: "text",
        position: { x: 100, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Source",
        style: defaultBoardSettings.textNodeStyle
      },
      {
        id: "node_2",
        type: "text",
        position: { x: 360, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Target",
        style: defaultBoardSettings.textNodeStyle
      }
    ]),
    edges: {
      [edgeId]: {
        id: edgeId,
        from: { type: "node", nodeId: "node_1" },
        to: { type: "node", nodeId: "node_2" },
        fixedPoints: [],
        ...defaultBoardSettings.edgeStyle
      }
    }
  };
}
```

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL because edge click selection and toolbar do not exist.

- [ ] **Step 2: Implement EdgeControlLayer**

Create `src/renderer/board/layers/EdgeControlLayer.tsx`:

```typescript
import type { PointerEvent, ReactElement } from "react";
import { approximateEdgePathPoints } from "../../../application/geometry/edgeHitTesting";
import type { BoardEdge, BoardNode, EdgeId, Point, Viewport } from "../../../domain/board/types";
import { worldToScreen } from "../../../application/geometry/viewportTransform";

export type EdgeControlLayerProps = {
  edges: BoardEdge[];
  nodes: Record<string, BoardNode>;
  selectedEdgeIds: EdgeId[];
  hoveredEdgeId: EdgeId | null;
  viewport: Viewport;
  onEdgeStyleChange: (edgeId: EdgeId, patch: EdgeStylePatch) => void;
  onFixedPointPointerDown?: (edgeId: EdgeId, index: number, event: PointerEvent<HTMLButtonElement>) => void;
};

export type EdgeStylePatch = Partial<Pick<BoardEdge, "pathType" | "arrow">> & {
  stroke?: Partial<BoardEdge["stroke"]>;
};

export function EdgeControlLayer({
  edges,
  hoveredEdgeId,
  nodes,
  onEdgeStyleChange,
  onFixedPointPointerDown,
  selectedEdgeIds,
  viewport
}: EdgeControlLayerProps): ReactElement {
  const selectedEdges = edges.filter((edge) => selectedEdgeIds.includes(edge.id));
  const handleEdges = edges.filter((edge) => selectedEdgeIds.includes(edge.id) || hoveredEdgeId === edge.id);

  return (
    <div data-testid="edge-control-layer" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {selectedEdges.map((edge) => {
        const toolbarPoint = getToolbarPoint(edge, nodes, viewport);
        return (
          <div
            data-testid={`edge-floating-toolbar-${edge.id}`}
            key={`toolbar-${edge.id}`}
            style={{
              alignItems: "center",
              background: "#fffdf8",
              border: "1px solid #d8d2c6",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(36, 34, 31, 0.16)",
              display: "flex",
              gap: 4,
              left: toolbarPoint.x,
              padding: 6,
              pointerEvents: "auto",
              position: "absolute",
              top: toolbarPoint.y,
              transform: "translate(-50%, -120%)"
            }}
          >
            <button aria-label="Straight edge" data-testid={`edge-path-straight-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { pathType: "straight" })} type="button">S</button>
            <button aria-label="Curved edge" data-testid={`edge-path-bezier-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { pathType: "bezier" })} type="button">C</button>
            <button aria-label="Elbow edge" data-testid={`edge-path-roundedElbow-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { pathType: "roundedElbow" })} type="button">E</button>
            <button aria-label="No arrow" data-testid={`edge-arrow-none-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { arrow: "none" })} type="button">0</button>
            <button aria-label="One-way arrow" data-testid={`edge-arrow-end-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { arrow: "end" })} type="button">1</button>
            <button aria-label="Two-way arrow" data-testid={`edge-arrow-both-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { arrow: "both" })} type="button">2</button>
            <button aria-label="Solid line" data-testid={`edge-dash-solid-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { stroke: { dash: "solid" } })} type="button">-</button>
            <button aria-label="Dashed line" data-testid={`edge-dash-dashed-${edge.id}`} onClick={() => onEdgeStyleChange(edge.id, { stroke: { dash: "dashed" } })} type="button">--</button>
            <input aria-label="Edge color" data-testid={`edge-color-${edge.id}`} onChange={(event) => onEdgeStyleChange(edge.id, { stroke: { color: event.currentTarget.value } })} type="color" value={edge.stroke.color} />
            <input aria-label="Edge width" data-testid={`edge-width-${edge.id}`} max="8" min="1" onChange={(event) => onEdgeStyleChange(edge.id, { stroke: { width: Number(event.currentTarget.value) } })} type="range" value={edge.stroke.width} />
          </div>
        );
      })}
      {handleEdges.flatMap((edge) =>
        edge.fixedPoints.map((point, index) => {
          const screenPoint = worldToScreen(point, viewport);
          return (
            <button
              aria-label="Move fixed point"
              data-testid={`edge-fixed-point-${edge.id}-${index}`}
              key={`${edge.id}-${index}`}
              onPointerDown={(event) => onFixedPointPointerDown?.(edge.id, index, event)}
              style={{
                background: "#2f6f6a",
                border: "2px solid #fffdf8",
                borderRadius: 6,
                height: 12,
                left: screenPoint.x,
                padding: 0,
                pointerEvents: "auto",
                position: "absolute",
                top: screenPoint.y,
                transform: "translate(-50%, -50%)",
                width: 12
              }}
              type="button"
            />
          );
        })
      )}
    </div>
  );
}

function getToolbarPoint(edge: BoardEdge, nodes: Record<string, BoardNode>, viewport: Viewport): Point {
  const points = approximateEdgePathPoints(edge, nodes);
  const middle = points[Math.floor(points.length / 2)] ?? points[0] ?? { x: 0, y: 0 };
  return worldToScreen(middle, viewport);
}
```

- [ ] **Step 3: Wire edge selection and toolbar commands in BoardCanvas**

In `BoardCanvas.tsx`, import:

```typescript
import { hitTestEdges } from "../../application/geometry/edgeHitTesting";
import { UpdateEdgeStyleCommand } from "../../application/commands/boardInteractionCommands";
import { EdgeControlLayer, type EdgeStylePatch } from "./layers/EdgeControlLayer";
```

Read new store APIs:

```typescript
const selectEdges = useDocumentStore((state) => state.selectEdges);
```

Add state:

```typescript
const [hoveredEdgeId, setHoveredEdgeId] = useState<EdgeId | null>(null);
```

Add helper:

```typescript
const hitTestEdgeFromEvent = (event: PointerEvent<HTMLDivElement>) => {
  return hitTestEdges(edges, board.nodes, getLocalScreenPoint(event), viewport, 8);
};

const updateEdgeStyle = (edgeId: EdgeId, patch: EdgeStylePatch): void => {
  runBoardCommand(
    new UpdateEdgeStyleCommand({
      clock: new Date().toISOString(),
      edgeId,
      patch
    })
  );
};
```

In `finishSelectionBox`, after drag threshold check and before `selectNodes([])`:

```typescript
const edgeHit = hitTestEdgeFromEvent(event);
if (edgeHit) {
  selectEdges([edgeHit.edgeId]);
  return;
}
```

In `updatePointerInteraction`, when not panning, dragging, resizing, or drawing a selection box, update hover:

```typescript
const edgeHit = hitTestEdgeFromEvent(event);
setHoveredEdgeId(edgeHit?.edgeId ?? null);
```

Render `EdgeControlLayer` after `NodeDomLayer` and before `InteractionOverlayLayer`:

```tsx
<EdgeControlLayer
  edges={edges}
  hoveredEdgeId={hoveredEdgeId}
  nodes={board.nodes}
  onEdgeStyleChange={updateEdgeStyle}
  selectedEdgeIds={board.selection.edgeIds}
  viewport={viewport}
/>
```

- [ ] **Step 4: Verify edge selection and toolbar tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/renderer/board/BoardCanvas.tsx src/renderer/board/layers/EdgeControlLayer.tsx tests/renderer/board/BoardCanvas.interactions.test.tsx
git commit -m "feat: add edge selection toolbar"
```

## Task 6: Fixed Point Insertion And Dragging

**Files:**

- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/EdgeControlLayer.tsx`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`

- [ ] **Step 1: Write failing fixed-point interaction tests**

Add these tests to `tests/renderer/board/BoardCanvas.interactions.test.tsx`:

```typescript
it("inserts a fixed point by double-clicking an edge", () => {
  resetStore({
    ...createBoardWithEdge("edge_1"),
    selection: { nodeIds: [], edgeIds: ["edge_1"] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 340, clientY: 148 });

  expect(useDocumentStore.getState().currentBoard?.edges.edge_1?.fixedPoints).toEqual([{ x: 340, y: 148 }]);
  expect(screen.getByTestId("edge-fixed-point-edge_1-0")).toBeInTheDocument();
});

it("moves a fixed point by dragging its handle and supports undo", () => {
  resetStore({
    ...createBoardWithEdge("edge_1"),
    edges: {
      edge_1: {
        ...createBoardWithEdge("edge_1").edges.edge_1!,
        fixedPoints: [{ x: 340, y: 148 }]
      }
    },
    selection: { nodeIds: [], edgeIds: ["edge_1"] }
  });
  render(<StoreConnectedBoard />);

  fireEvent.pointerDown(screen.getByTestId("edge-fixed-point-edge_1-0"), {
    button: 0,
    clientX: 340,
    clientY: 148,
    pointerId: 1
  });
  fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 380, clientY: 190, pointerId: 1 });

  expect(useDocumentStore.getState().currentBoard?.edges.edge_1?.fixedPoints[0]).toEqual({ x: 380, y: 190 });

  fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });

  expect(useDocumentStore.getState().currentBoard?.edges.edge_1?.fixedPoints[0]).toEqual({ x: 340, y: 148 });
});
```

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL because edge double-click insertion and fixed-point dragging are not wired.

- [ ] **Step 2: Implement fixed-point drag state**

In `BoardCanvas.tsx`, import fixed-point commands:

```typescript
import {
  CreateEdgeCommand,
  CreateLinkedTextNodeCommand,
  CreateTextNodeCommand,
  InsertEdgeFixedPointCommand,
  MoveEdgeFixedPointCommand,
  MoveNodesCommand,
  ResizeNodeCommand,
  UpdateEdgeStyleCommand,
  UpdateTextNodeCommand,
  estimateTextNodeSize
} from "../../application/commands/boardInteractionCommands";
```

Add state:

```typescript
type FixedPointDragState = {
  edgeId: EdgeId;
  index: number;
};

const fixedPointDragRef = useRef<FixedPointDragState | null>(null);
```

Add handlers:

```typescript
const insertFixedPointFromDoubleClick = (event: MouseEvent<HTMLDivElement>): boolean => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const screenPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const edgeHit = hitTestEdges(edges, board.nodes, screenPoint, viewport, 8);
  if (!edgeHit) {
    return false;
  }

  runBoardCommand(
    new InsertEdgeFixedPointCommand({
      clock: new Date().toISOString(),
      edgeId: edgeHit.edgeId,
      index: edgeHit.insertionIndex,
      point: edgeHit.worldPoint
    })
  );
  selectEdges([edgeHit.edgeId]);
  return true;
};

const beginFixedPointDrag = (edgeId: EdgeId, index: number, event: PointerEvent<HTMLButtonElement>): void => {
  if (event.button !== 0) {
    return;
  }

  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  fixedPointDragRef.current = { edgeId, index };
};

const finishFixedPointDrag = (event: PointerEvent<HTMLDivElement>): void => {
  const dragState = fixedPointDragRef.current;
  if (!dragState) {
    return;
  }

  fixedPointDragRef.current = null;
  runBoardCommand(
    new MoveEdgeFixedPointCommand({
      clock: new Date().toISOString(),
      edgeId: dragState.edgeId,
      index: dragState.index,
      point: screenToWorld(getLocalScreenPoint(event), viewport)
    })
  );
};
```

Update `createNodeFromBlankDoubleClick`:

```typescript
const createNodeFromBlankDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
  if (insertFixedPointFromDoubleClick(event)) {
    return;
  }

  const bounds = event.currentTarget.getBoundingClientRect();
  const screenPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const nodeId = createNodeId();
  runBoardCommand(
    new CreateTextNodeCommand({
      clock: new Date().toISOString(),
      id: nodeId,
      position: screenToWorld(screenPoint, viewport),
      text: ""
    })
  );
  setEditingNodeId(nodeId);
  setEditingDraft({ nodeId, text: "" });
};
```

Update `finishPointerInteraction` so fixed points finish before selection:

```typescript
const finishPointerInteraction = (event: PointerEvent<HTMLDivElement>): void => {
  finishFixedPointDrag(event);
  finishNodeResize(event);
  finishNodeDrag(event);
  finishSelectionBox(event);
  endPan(event);
};
```

Pass handler to `EdgeControlLayer`:

```tsx
onFixedPointPointerDown={beginFixedPointDrag}
```

- [ ] **Step 3: Verify fixed-point tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit Task 6**

```bash
git add src/renderer/board/BoardCanvas.tsx src/renderer/board/layers/EdgeControlLayer.tsx tests/renderer/board/BoardCanvas.interactions.test.tsx
git commit -m "feat: edit edge fixed points"
```

## Task 7: Full Verification And Manual Smoke

**Files:**

- Modify: `Memory/YYYY-MM-DD_HH-mm-ss_M4蓝图式连线核心交互.md`

- [ ] **Step 1: Run focused tests**

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts tests/application/geometry/edgeHitTesting.test.ts tests/application/geometry/linkedNodePlacement.test.ts tests/renderer/board/EdgeCanvasLayer.test.tsx tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

```bash
npm.cmd test
```

Expected: PASS for all test files.

- [ ] **Step 3: Run typecheck and build**

```bash
npm.cmd run typecheck
npm.cmd run build
```

Expected: both commands exit 0.

- [ ] **Step 4: Manual desktop smoke**

Run:

```bash
npm.cmd run dev
```

Manual checks:

- Create/open a board.
- Create two text nodes.
- Select one node and press `Tab`; confirm a new editable node appears to the right and a default curved arrow connects it.
- Select a node and press `Ctrl+L`; click another node; confirm the edge is selected.
- Press `Ctrl+L` from a selected node and click blank canvas; confirm a point endpoint edge appears.
- Select an edge; use the floating toolbar to switch path, arrow, dash, color, and width.
- Double-click an edge; confirm a fixed point appears.
- Drag the fixed point and press `Ctrl+Z` / `Ctrl+Y`; confirm the route changes and restores.

Stop the dev process after smoke completes.

- [ ] **Step 5: Add conversation memory**

Create `Memory/YYYY-MM-DD_HH-mm-ss_M4蓝图式连线核心交互.md` with:

```markdown
# M4 蓝图式连线核心交互

- 目标：实现 Tab 相连节点、Ctrl+L 拉线、连线样式工具条和固定点编辑。
- 基线：进入 M4 前 `npm.cmd test` 通过 15 个测试文件、85 个测试。
- 验证：记录本次 M4 的 focused tests、full tests、typecheck、build 和手动 smoke 结果。
- 备注：M4 继续基于 `codex/m4-edge-interactions` worktree 分支推进。
```

- [ ] **Step 6: Commit final M4 verification notes**

```bash
git add Memory docs/superpowers/plans/2026-05-15-freelinkboard-m4-edge-interactions-plan.md
git commit -m "docs: add m4 edge interaction notes"
```

Only include the plan file in this commit if it has not already been committed before implementation starts.

## Self-Review Checklist

- Spec coverage: M4 design spec items map to tasks 1, 3, 4, 5, and 6.
- Out-of-scope check: M5 search/settings and M6 performance packaging remain outside this plan.
- Type consistency: commands use existing `BoardEdge`, `EdgeEndpoint`, `BoardSelection`, `BoardState`, `NodeId`, and `EdgeId`.
- Testability: command and geometry tests run without React or Electron; renderer tests cover keyboard, pointer, toolbar, and fixed-point flows.
- Dependency direction: domain types stay dependency-free; application geometry has no React or DOM dependency; renderer owns event state only.
