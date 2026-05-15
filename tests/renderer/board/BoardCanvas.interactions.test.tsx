import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";
import { BoardCanvas } from "../../../src/renderer/board/BoardCanvas";
import { useDocumentStore } from "../../../src/renderer/stores/documentStore";

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "stable-node")
}));

const mockCanvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  scale: vi.fn(),
  setLineDash: vi.fn(),
  stroke: vi.fn()
};

class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, eventInitDict: PointerEventInit = {}) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict.pointerId ?? 1;
  }
}

function resetStore(board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z")): void {
  useDocumentStore.setState({
    currentPath: null,
    currentBoard: board,
    recentFiles: [],
    saveStatus: "saved",
    fileError: null
  });
}

function StoreConnectedBoard() {
  const board = useDocumentStore((state) => state.currentBoard);
  return board ? <BoardCanvas board={board} size={{ width: 640, height: 360 }} /> : null;
}

function createBoardWithNode(): BoardState {
  const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
  return {
    ...board,
    nodes: {
      node_1: {
        id: "node_1",
        type: "text",
        position: { x: 100, y: 120 },
        size: defaultBoardSettings.textNodeSize,
        sizing: "auto",
        text: "Existing",
        style: defaultBoardSettings.textNodeStyle
      }
    }
  };
}

describe("BoardCanvas interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: vi.fn(() => mockCanvasContext as unknown as CanvasRenderingContext2D)
    });
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: TestPointerEvent
    });
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it("creates an editable selected node when double-clicking blank canvas", () => {
    render(<StoreConnectedBoard />);

    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByTestId("board-node-node_stable-node")).toHaveAttribute("data-selected", "true");
    expect(useDocumentStore.getState().currentBoard?.nodes["node_stable-node"]?.position).toEqual({
      x: 120,
      y: 140
    });
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
  });

  it("commits edited node text on blur", () => {
    render(<StoreConnectedBoard />);
    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Refined idea" } });
    fireEvent.blur(screen.getByRole("textbox"));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Refined idea")).toBeTruthy();
    expect(useDocumentStore.getState().currentBoard?.nodes["node_stable-node"]?.text).toBe("Refined idea");
  });

  it("selects a node on click and enters editing on double click", () => {
    resetStore(createBoardWithNode());
    render(<StoreConnectedBoard />);

    fireEvent.click(screen.getByTestId("board-node-node_1"));

    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["node_1"]);
    expect(screen.getByTestId("board-node-node_1")).toHaveAttribute("data-selected", "true");

    fireEvent.doubleClick(screen.getByTestId("board-node-node_1"));

    expect(screen.getByRole("textbox")).toHaveValue("Existing");
  });

  it("moves a selected node after left-button dragging", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);
    const node = screen.getByTestId("board-node-node_1");

    fireEvent.pointerDown(node, { button: 0, clientX: 100, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId("board-canvas"), { clientX: 130, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 130, clientY: 150, pointerId: 1 });

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.position).toEqual({ x: 130, y: 150 });
  });

  it("keeps right-button panning available when starting on a node", () => {
    resetStore(createBoardWithNode());
    render(<StoreConnectedBoard />);

    fireEvent.pointerDown(screen.getByTestId("board-node-node_1"), {
      button: 2,
      clientX: 100,
      clientY: 120,
      pointerId: 1
    });
    fireEvent.pointerMove(screen.getByTestId("board-canvas"), { clientX: 130, clientY: 120, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 130, clientY: 120, pointerId: 1 });

    expect(screen.getByTestId("interaction-overlay-layer").textContent).toContain("x -30");
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.position).toEqual({ x: 100, y: 120 });
  });

  it("renders committed multiline text as wrapped content", () => {
    render(<StoreConnectedBoard />);
    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Line one\nLine two\nLine three" } });
    fireEvent.blur(screen.getByRole("textbox"));

    const node = useDocumentStore.getState().currentBoard?.nodes["node_stable-node"];
    expect(node?.size.height).toBeGreaterThan(defaultBoardSettings.textNodeSize.height);
    expect(screen.getByTestId("board-node-content-node_stable-node")).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it("supports Ctrl+Z and Ctrl+Y for created nodes", () => {
    render(<StoreConnectedBoard />);
    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });

    expect(screen.queryByTestId("board-node-node_stable-node")).toBeNull();

    fireEvent.keyDown(window, { code: "KeyY", ctrlKey: true });

    expect(screen.getByTestId("board-node-node_stable-node")).toBeTruthy();
  });

  it("keeps keyboard undo scoped to text editing while a textarea is active", () => {
    render(<StoreConnectedBoard />);
    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    fireEvent.keyDown(screen.getByRole("textbox"), { code: "KeyZ", ctrlKey: true });

    expect(screen.getByTestId("board-node-node_stable-node")).toBeTruthy();
  });
});
