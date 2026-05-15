import { defaultBoardSettings } from "../../domain/board/defaults";
import type { BoardNode, BoardSelection, BoardState, NodeId, Point, Size } from "../../domain/board/types";
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

export type UpdateTextNodeCommandInput = {
  id: NodeId;
  text: string;
  clock: string;
};

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
