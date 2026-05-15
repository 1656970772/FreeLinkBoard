import { defaultBoardSettings } from "../../domain/board/defaults";
import type {
  BoardEdge,
  BoardDefaults,
  BoardNode,
  BoardSelection,
  BoardState,
  EdgeEndpoint,
  EdgeId,
  NodeId,
  Point,
  Size
} from "../../domain/board/types";
import type { BoardCommand } from "./BoardCommand";

const TEXT_NODE_VERTICAL_PADDING = 20;
const TEXT_NODE_LINE_HEIGHT = 18;
const TEXT_NODE_HORIZONTAL_PADDING = 24;
const MIN_AUTO_TEXT_NODE_WIDTH = 120;
const MAX_AUTO_TEXT_NODE_WIDTH = 320;
const LATIN_TEXT_CHARACTER_WIDTH = 7.5;
const CJK_TEXT_CHARACTER_WIDTH = 14;
const SPACE_TEXT_CHARACTER_WIDTH = 4;

export function estimateTextNodeSize(text: string): Size {
  const lines = text.split(/\r\n|\r|\n/);
  const longestLineWidth = Math.max(...lines.map(estimateTextLineWidth), 0);
  const width = clamp(
    Math.ceil(longestLineWidth + TEXT_NODE_HORIZONTAL_PADDING),
    MIN_AUTO_TEXT_NODE_WIDTH,
    MAX_AUTO_TEXT_NODE_WIDTH
  );
  const availableWidth = Math.max(1, width - TEXT_NODE_HORIZONTAL_PADDING);
  const visualLineCount = lines.reduce((count, line) => {
    return count + Math.max(1, Math.ceil(estimateTextLineWidth(line) / availableWidth));
  }, 0);

  return {
    width,
    height: Math.max(
      defaultBoardSettings.textNodeSize.height,
      TEXT_NODE_VERTICAL_PADDING + visualLineCount * TEXT_NODE_LINE_HEIGHT
    )
  };
}

export type CreateTextNodeCommandInput = {
  id: NodeId;
  position: Point;
  text: string;
  clock: string;
};

export class CreateTextNodeCommand implements BoardCommand {
  readonly name = "create-text-node";

  private previousNode: BoardNode | undefined;
  private previousSelection: BoardSelection | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: CreateTextNodeCommandInput) {}

  execute(state: BoardState): BoardState {
    this.previousNode = state.nodes[this.input.id];
    this.previousSelection = cloneSelection(state.selection);
    this.previousUpdatedAt = state.updatedAt;

    const node: BoardNode = {
      id: this.input.id,
      type: "text",
      position: { ...this.input.position },
      size: estimateTextNodeSize(this.input.text),
      sizing: "auto",
      text: this.input.text,
      style: { ...defaultBoardSettings.textNodeStyle }
    };

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [node.id]: node
      },
      selection: { nodeIds: [node.id], edgeIds: [] },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    const { [this.input.id]: removedNode, ...remainingNodes } = state.nodes;
    void removedNode;

    return {
      ...state,
      nodes: this.previousNode
        ? { ...remainingNodes, [this.previousNode.id]: this.previousNode }
        : remainingNodes,
      selection: this.previousSelection ?? state.selection,
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type CreateLinkedTextNodeCommandInput = {
  edgeId: EdgeId;
  nodeId: NodeId;
  sourceNodeId: NodeId;
  position: Point;
  text: string;
  clock: string;
  edgeStyle?: BoardDefaults["edgeStyle"];
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
    const edge = createDefaultEdge(
      this.input.edgeId,
      { type: "node", nodeId: this.input.sourceNodeId },
      { type: "node", nodeId: this.input.nodeId },
      this.input.edgeStyle
    );

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [node.id]: node
      },
      edges: {
        ...state.edges,
        [edge.id]: edge
      },
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
  edgeStyle?: BoardDefaults["edgeStyle"];
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

    const edge = createDefaultEdge(this.input.edgeId, this.input.from, this.input.to, this.input.edgeStyle);

    return {
      ...state,
      edges: {
        ...state.edges,
        [edge.id]: edge
      },
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

export type UpdateTextNodeCommandInput = {
  id: NodeId;
  text: string;
  clock: string;
};

export type DeleteBoardItemsCommandInput = {
  selection: BoardSelection;
  clock: string;
};

export class DeleteBoardItemsCommand implements BoardCommand {
  readonly name = "delete-board-items";

  private previousNodes: Record<NodeId, BoardNode> | undefined;
  private previousEdges: Record<EdgeId, BoardEdge> | undefined;
  private previousSelection: BoardSelection | undefined;
  private previousUpdatedAt: string | undefined;
  private didDelete = false;

  constructor(private readonly input: DeleteBoardItemsCommandInput) {}

  execute(state: BoardState): BoardState {
    this.didDelete = false;
    const selectedNodeIds = new Set(this.input.selection.nodeIds);
    const selectedEdgeIds = new Set(this.input.selection.edgeIds);

    const nextNodes = { ...state.nodes };
    for (const nodeId of selectedNodeIds) {
      if (nodeId in nextNodes) {
        delete nextNodes[nodeId];
        this.didDelete = true;
      }
    }

    const nextEdges = { ...state.edges };
    for (const [edgeId, edge] of Object.entries(state.edges)) {
      if (selectedEdgeIds.has(edgeId) || endpointReferencesDeletedNode(edge.from, selectedNodeIds) || endpointReferencesDeletedNode(edge.to, selectedNodeIds)) {
        delete nextEdges[edgeId];
        this.didDelete = true;
      }
    }

    if (!this.didDelete) {
      return state;
    }

    this.previousNodes = state.nodes;
    this.previousEdges = state.edges;
    this.previousSelection = cloneSelection(state.selection);
    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      nodes: nextNodes,
      edges: nextEdges,
      selection: { nodeIds: [], edgeIds: [] },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.didDelete || !this.previousNodes || !this.previousEdges) {
      return state;
    }

    return {
      ...state,
      nodes: this.previousNodes,
      edges: this.previousEdges,
      selection: this.previousSelection ?? state.selection,
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type PasteBoardItemsCommandInput = {
  nodes: BoardNode[];
  edges: BoardEdge[];
  selection: BoardSelection;
  clock: string;
};

export class PasteBoardItemsCommand implements BoardCommand {
  readonly name = "paste-board-items";

  private previousNodes: Record<NodeId, BoardNode> = {};
  private previousEdges: Record<EdgeId, BoardEdge> = {};
  private previousSelection: BoardSelection | undefined;
  private previousUpdatedAt: string | undefined;
  private didPaste = false;

  constructor(private readonly input: PasteBoardItemsCommandInput) {}

  execute(state: BoardState): BoardState {
    this.previousNodes = {};
    this.previousEdges = {};
    this.didPaste = this.input.nodes.length > 0 || this.input.edges.length > 0;
    if (!this.didPaste) {
      return state;
    }

    const nextNodes = { ...state.nodes };
    for (const node of this.input.nodes) {
      const previousNode = state.nodes[node.id];
      if (previousNode) {
        this.previousNodes[node.id] = previousNode;
      }
      nextNodes[node.id] = cloneNode(node);
    }

    const nextEdges = { ...state.edges };
    for (const edge of this.input.edges) {
      const previousEdge = state.edges[edge.id];
      if (previousEdge) {
        this.previousEdges[edge.id] = previousEdge;
      }
      nextEdges[edge.id] = cloneEdge(edge);
    }

    this.previousSelection = cloneSelection(state.selection);
    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      nodes: nextNodes,
      edges: nextEdges,
      selection: cloneSelection(this.input.selection),
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.didPaste) {
      return state;
    }

    const nextNodes = { ...state.nodes };
    for (const node of this.input.nodes) {
      delete nextNodes[node.id];
    }
    for (const node of Object.values(this.previousNodes)) {
      nextNodes[node.id] = node;
    }

    const nextEdges = { ...state.edges };
    for (const edge of this.input.edges) {
      delete nextEdges[edge.id];
    }
    for (const edge of Object.values(this.previousEdges)) {
      nextEdges[edge.id] = edge;
    }

    return {
      ...state,
      nodes: nextNodes,
      edges: nextEdges,
      selection: this.previousSelection ?? state.selection,
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export class UpdateTextNodeCommand implements BoardCommand {
  readonly name = "update-text-node";

  private previousNode: BoardNode | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: UpdateTextNodeCommandInput) {}

  execute(state: BoardState): BoardState {
    const node = state.nodes[this.input.id];
    if (!node) {
      return state;
    }

    this.previousNode = node;
    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [node.id]: {
          ...node,
          text: this.input.text,
          size: node.sizing === "auto" ? estimateTextNodeSize(this.input.text) : node.size
        }
      },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.previousNode) {
      return state;
    }

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [this.previousNode.id]: this.previousNode
      },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type ResizeNodeCommandInput = {
  id: NodeId;
  position?: Point;
  size: Size;
  clock: string;
};

export class ResizeNodeCommand implements BoardCommand {
  readonly name = "resize-node";

  private previousNode: BoardNode | undefined;
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: ResizeNodeCommandInput) {}

  execute(state: BoardState): BoardState {
    const node = state.nodes[this.input.id];
    if (!node) {
      return state;
    }

    this.previousNode = node;
    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [node.id]: {
          ...node,
          position: this.input.position ? { ...this.input.position } : node.position,
          size: { ...this.input.size },
          sizing: "fixed"
        }
      },
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (!this.previousNode) {
      return state;
    }

    return {
      ...state,
      nodes: {
        ...state.nodes,
        [this.previousNode.id]: this.previousNode
      },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

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
            ...(this.input.patch.stroke ?? {})
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
      edges: {
        ...state.edges,
        [this.previousEdge.id]: this.previousEdge
      },
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
      edges: {
        ...state.edges,
        [edge.id]: {
          ...edge,
          fixedPoints
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
      edges: {
        ...state.edges,
        [this.previousEdge.id]: this.previousEdge
      },
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
      edges: {
        ...state.edges,
        [edge.id]: {
          ...edge,
          fixedPoints
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
      edges: {
        ...state.edges,
        [this.previousEdge.id]: this.previousEdge
      },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

export type MoveNodesCommandInput = {
  ids: NodeId[];
  delta: Point;
  clock: string;
};

export class MoveNodesCommand implements BoardCommand {
  readonly name = "move-nodes";

  private previousNodes: Record<NodeId, BoardNode> = {};
  private previousUpdatedAt: string | undefined;

  constructor(private readonly input: MoveNodesCommandInput) {}

  execute(state: BoardState): BoardState {
    this.previousNodes = {};

    const nextNodes = { ...state.nodes };
    for (const id of this.input.ids) {
      const node = state.nodes[id];
      if (!node) {
        continue;
      }

      this.previousNodes[id] = node;
      nextNodes[id] = {
        ...node,
        position: {
          x: node.position.x + this.input.delta.x,
          y: node.position.y + this.input.delta.y
        }
      };
    }

    if (Object.keys(this.previousNodes).length === 0) {
      return state;
    }

    this.previousUpdatedAt = state.updatedAt;

    return {
      ...state,
      nodes: nextNodes,
      updatedAt: this.input.clock
    };
  }

  undo(state: BoardState): BoardState {
    if (Object.keys(this.previousNodes).length === 0) {
      return state;
    }

    return {
      ...state,
      nodes: {
        ...state.nodes,
        ...this.previousNodes
      },
      updatedAt: this.previousUpdatedAt ?? state.updatedAt
    };
  }
}

function cloneSelection(selection: BoardSelection): BoardSelection {
  return {
    nodeIds: [...selection.nodeIds],
    edgeIds: [...selection.edgeIds]
  };
}

function createDefaultEdge(
  edgeId: EdgeId,
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  edgeStyle = defaultBoardSettings.edgeStyle
): BoardEdge {
  return {
    id: edgeId,
    from: cloneEndpoint(from),
    to: cloneEndpoint(to),
    fixedPoints: [],
    pathType: edgeStyle.pathType,
    arrow: edgeStyle.arrow,
    stroke: { ...edgeStyle.stroke }
  };
}

function endpointReferencesDeletedNode(endpoint: EdgeEndpoint, selectedNodeIds: Set<NodeId>): boolean {
  return endpoint.type === "node" && selectedNodeIds.has(endpoint.nodeId);
}

function cloneNode(node: BoardNode): BoardNode {
  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    style: { ...node.style }
  };
}

function cloneEdge(edge: BoardEdge): BoardEdge {
  return {
    ...edge,
    from: cloneEndpoint(edge.from),
    to: cloneEndpoint(edge.to),
    stroke: { ...edge.stroke },
    fixedPoints: edge.fixedPoints.map((point) => ({ ...point }))
  };
}

function cloneEndpoint(endpoint: EdgeEndpoint): EdgeEndpoint {
  if (endpoint.type === "point") {
    return {
      type: "point",
      point: { ...endpoint.point }
    };
  }

  return {
    type: "node",
    nodeId: endpoint.nodeId
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateTextLineWidth(line: string): number {
  return Array.from(line).reduce((width, character) => {
    if (/\s/.test(character)) {
      return width + SPACE_TEXT_CHARACTER_WIDTH;
    }

    if (/[\u3000-\u9fff\uff00-\uffef]/.test(character)) {
      return width + CJK_TEXT_CHARACTER_WIDTH;
    }

    return width + LATIN_TEXT_CHARACTER_WIDTH;
  }, 0);
}
