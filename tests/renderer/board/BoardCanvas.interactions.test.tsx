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
  return createBoardWithNodes([
    {
      id: "node_1",
      type: "text",
      position: { x: 100, y: 120 },
      size: defaultBoardSettings.textNodeSize,
      sizing: "auto",
      text: "Existing",
      style: defaultBoardSettings.textNodeStyle
    }
  ]);
}

function createBoardWithNodes(nodes: BoardState["nodes"][string][]): BoardState {
  const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
  return {
    ...board,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node]))
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

    expect(screen.getByTestId("board-node-node_1")).toHaveStyle({
      transform: "translate(130px, 150px) scale(1)"
    });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.position).toEqual({ x: 100, y: 120 });

    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 130, clientY: 150, pointerId: 1 });

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.position).toEqual({ x: 130, y: 150 });
  });

  it("keeps a node visible after repeated live drags", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    for (let index = 0; index < 3; index += 1) {
      const start = 120 + index * 30;
      fireEvent.pointerDown(screen.getByTestId("board-node-node_1"), {
        button: 0,
        clientX: start,
        clientY: start,
        pointerId: index + 1
      });
      fireEvent.pointerMove(screen.getByTestId("board-canvas"), {
        clientX: start + 30,
        clientY: start + 20,
        pointerId: index + 1
      });
      fireEvent.pointerUp(screen.getByTestId("board-canvas"), {
        clientX: start + 30,
        clientY: start + 20,
        pointerId: index + 1
      });

      expect(screen.getByTestId("board-node-node_1")).toBeInTheDocument();
    }
  });

  it("box-selects nodes by dragging blank canvas", () => {
    resetStore(
      createBoardWithNodes([
        {
          id: "node_1",
          type: "text",
          position: { x: 100, y: 120 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "First",
          style: defaultBoardSettings.textNodeStyle
        },
        {
          id: "node_2",
          type: "text",
          position: { x: 260, y: 180 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Second",
          style: defaultBoardSettings.textNodeStyle
        },
        {
          id: "node_3",
          type: "text",
          position: { x: 520, y: 260 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Outside",
          style: defaultBoardSettings.textNodeStyle
        }
      ])
    );
    render(<StoreConnectedBoard />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.pointerDown(canvas, { button: 0, clientX: 80, clientY: 90, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 430, clientY: 250, pointerId: 1 });

    expect(screen.getByTestId("selection-box")).toBeInTheDocument();

    fireEvent.pointerUp(canvas, { clientX: 430, clientY: 250, pointerId: 1 });

    expect(screen.queryByTestId("selection-box")).toBeNull();
    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["node_1", "node_2"]);
    expect(screen.getByTestId("board-node-node_1")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("board-node-node_2")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("board-node-node_3")).toHaveAttribute("data-selected", "false");
  });

  it("clears selection on blank click without creating undo history", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.pointerDown(canvas, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 20, clientY: 30, pointerId: 1 });

    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual([]);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");

    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });

    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual([]);
  });

  it("moves all selected nodes when dragging one selected node", () => {
    resetStore({
      ...createBoardWithNodes([
        {
          id: "node_1",
          type: "text",
          position: { x: 100, y: 120 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "First",
          style: defaultBoardSettings.textNodeStyle
        },
        {
          id: "node_2",
          type: "text",
          position: { x: 260, y: 180 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Second",
          style: defaultBoardSettings.textNodeStyle
        },
        {
          id: "node_3",
          type: "text",
          position: { x: 520, y: 260 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Outside",
          style: defaultBoardSettings.textNodeStyle
        }
      ]),
      selection: { nodeIds: ["node_1", "node_2"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    fireEvent.pointerDown(screen.getByTestId("board-node-node_1"), {
      button: 0,
      clientX: 110,
      clientY: 130,
      pointerId: 1
    });
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 150, clientY: 160, pointerId: 1 });
    fireEvent.click(screen.getByTestId("board-node-node_1"));

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.position).toEqual({ x: 140, y: 150 });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_2?.position).toEqual({ x: 300, y: 210 });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_3?.position).toEqual({ x: 520, y: 260 });
    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["node_1", "node_2"]);
  });

  it("box selection uses world coordinates when zoomed", () => {
    resetStore({
      ...createBoardWithNodes([
        {
          id: "node_1",
          type: "text",
          position: { x: 50, y: 60 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Zoomed",
          style: defaultBoardSettings.textNodeStyle
        },
        {
          id: "node_2",
          type: "text",
          position: { x: 240, y: 60 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Outside",
          style: defaultBoardSettings.textNodeStyle
        }
      ]),
      viewport: { x: 0, y: 0, zoom: 2 }
    });
    render(<StoreConnectedBoard />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.pointerDown(canvas, { button: 0, clientX: 80, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 220, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 220, pointerId: 1 });

    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["node_1"]);
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

  it("auto-sizes an edited auto node live before blur", () => {
    render(<StoreConnectedBoard />);
    fireEvent.doubleClick(screen.getByTestId("board-canvas"), { clientX: 120, clientY: 140 });

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "asd\nadasd\nasdasd" } });

    expect(screen.getByTestId("board-node-node_stable-node")).toHaveStyle({
      width: "120px",
      height: "74px"
    });
    expect(useDocumentStore.getState().currentBoard?.nodes["node_stable-node"]?.text).toBe("");

    fireEvent.blur(screen.getByRole("textbox"));

    expect(useDocumentStore.getState().currentBoard?.nodes["node_stable-node"]?.text).toBe("asd\nadasd\nasdasd");
    expect(useDocumentStore.getState().currentBoard?.nodes["node_stable-node"]?.size).toEqual({
      width: 120,
      height: 74
    });
  });

  it("zooms only with Ctrl or Meta wheel", () => {
    render(<StoreConnectedBoard />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.wheel(canvas, { clientX: 320, clientY: 180, deltaY: -100 });

    expect(screen.getByTestId("interaction-overlay-layer").textContent).toContain("zoom 1.00");

    fireEvent.wheel(canvas, { clientX: 320, clientY: 180, ctrlKey: true, deltaY: -100 });

    expect(screen.getByTestId("interaction-overlay-layer").textContent).toContain("zoom 1.10");
  });

  it("zooms around the mouse position instead of the viewport origin", () => {
    resetStore(
      createBoardWithNodes([
        {
          id: "node_1",
          type: "text",
          position: { x: 320, y: 180 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto",
          text: "Cursor anchor",
          style: defaultBoardSettings.textNodeStyle
        }
      ])
    );
    render(<StoreConnectedBoard />);
    const canvas = screen.getByTestId("board-canvas");

    fireEvent.wheel(canvas, { clientX: 320, clientY: 180, ctrlKey: true, deltaY: -100 });

    expect(screen.getByTestId("interaction-overlay-layer").textContent).toContain("x 29 y 16 zoom 1.10");
    expect(screen.getByTestId("board-node-node_1")).toHaveStyle({
      transform: "translate(320px, 180px) scale(1.1)"
    });
  });

  it("renders a resize handle for a selected non-editing node", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    expect(screen.getByTestId("board-node-resize-node_1")).toBeInTheDocument();

    fireEvent.doubleClick(screen.getByTestId("board-node-node_1"));

    expect(screen.queryByTestId("board-node-resize-node_1")).toBeNull();
  });

  it("renders node size as the full border box", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    expect(screen.getByTestId("board-node-node_1")).toHaveStyle({
      boxSizing: "border-box",
      width: "160px",
      height: "56px"
    });
  });

  it("resizes a selected node into fixed sizing by dragging the resize handle", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    fireEvent.pointerDown(screen.getByTestId("board-node-resize-node_1"), {
      button: 0,
      clientX: 260,
      clientY: 176,
      pointerId: 1
    });
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 300, clientY: 216, pointerId: 1 });

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.size).toEqual({
      width: 200,
      height: 96
    });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.sizing).toBe("fixed");
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
  });

  it("supports undo and redo for node resize", () => {
    resetStore({
      ...createBoardWithNode(),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    fireEvent.pointerDown(screen.getByTestId("board-node-resize-node_1"), {
      button: 0,
      clientX: 260,
      clientY: 176,
      pointerId: 1
    });
    fireEvent.pointerUp(screen.getByTestId("board-canvas"), { clientX: 300, clientY: 216, pointerId: 1 });

    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.size).toEqual(defaultBoardSettings.textNodeSize);
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.sizing).toBe("auto");

    fireEvent.keyDown(window, { code: "KeyY", ctrlKey: true });

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.size).toEqual({
      width: 200,
      height: 96
    });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.sizing).toBe("fixed");
  });

  it("preserves fixed node size when editing longer text", () => {
    resetStore({
      ...createBoardWithNodes([
        {
          id: "node_1",
          type: "text",
          position: { x: 100, y: 120 },
          size: { width: 220, height: 72 },
          sizing: "fixed",
          text: "Fixed",
          style: defaultBoardSettings.textNodeStyle
        }
      ]),
      selection: { nodeIds: ["node_1"], edgeIds: [] }
    });
    render(<StoreConnectedBoard />);

    fireEvent.doubleClick(screen.getByTestId("board-node-node_1"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Long line one\nLong line two\nLong line three\nLong line four" }
    });
    fireEvent.blur(screen.getByRole("textbox"));

    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.text).toContain("Long line four");
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.size).toEqual({ width: 220, height: 72 });
    expect(useDocumentStore.getState().currentBoard?.nodes.node_1?.sizing).toBe("fixed");
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
