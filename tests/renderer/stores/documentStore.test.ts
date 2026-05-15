import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCommand } from "../../../src/application/commands/BoardCommand";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardNode, BoardState } from "../../../src/domain/board/types";
import { useDocumentStore } from "../../../src/renderer/stores/documentStore";
import type { ElectronFileApi } from "../../../src/shared/electronApi";

const resetStore = (): void => {
  useDocumentStore.setState({
    currentPath: null,
    currentBoard: null,
    recentFiles: [],
    saveStatus: "unsaved",
    fileError: null
  });
};

class AddMarkerNodeCommand implements BoardCommand {
  readonly name = "add-marker-node";

  execute(state: BoardState): BoardState {
    return {
      ...state,
      nodes: {
        ...state.nodes,
        marker: {
          id: "marker",
          type: "text",
          position: { x: 10, y: 20 },
          size: { width: 160, height: 56 },
          sizing: "auto",
          text: "Marker",
          style: {
            borderColor: "#24221f",
            backgroundColor: "#fffdf8",
            textColor: "#24221f"
          }
        }
      },
      selection: { nodeIds: ["marker"], edgeIds: [] },
      updatedAt: "2026-05-15T03:00:00.000Z"
    };
  }

  undo(state: BoardState): BoardState {
    const { marker: removedNode, ...nodes } = state.nodes;
    void removedNode;

    return {
      ...state,
      nodes,
      selection: { nodeIds: [], edgeIds: [] },
      updatedAt: "2026-05-15T02:00:00.000Z"
    };
  }
}

class NoOpBoardCommand implements BoardCommand {
  readonly name = "no-op";

  execute(state: BoardState): BoardState {
    return state;
  }

  undo(state: BoardState): BoardState {
    return state;
  }
}

function createTextNode(id: string, x: number, y: number): BoardNode {
  return {
    id,
    type: "text",
    position: { x, y },
    size: defaultBoardSettings.textNodeSize,
    sizing: "auto",
    text: id,
    style: defaultBoardSettings.textNodeStyle
  };
}

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

function deferred<T = void>(): {
  promise: Promise<T>;
  reject(error: unknown): void;
  resolve(value: T): void;
} {
  let rejectPromise!: (error: unknown) => void;
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise
  };
}

describe("documentStore", () => {
  beforeEach(() => {
    resetStore();
    Reflect.deleteProperty(window, "freeLinkBoard");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("treats a missing Electron file API as unavailable without throwing", async () => {
    await expect(useDocumentStore.getState().loadRecentFiles()).resolves.toBeUndefined();

    expect(useDocumentStore.getState().recentFiles).toEqual([]);
    expect(useDocumentStore.getState().fileError).toBe("Electron file API is unavailable.");
  });

  it("loads a recent board through the Electron API", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      loadFlb: vi.fn<ElectronFileApi["loadFlb"]>().mockResolvedValue(board),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;

    await useDocumentStore.getState().loadBoard("F:\\Boards\\systems.flb");

    expect(api.loadFlb).toHaveBeenCalledWith("F:\\Boards\\systems.flb");
    expect(useDocumentStore.getState().currentPath).toBe("F:\\Boards\\systems.flb");
    expect(useDocumentStore.getState().currentBoard).toEqual(board);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("restores dirty status when saving fails", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockRejectedValue(new Error("disk full")),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({ currentBoard: board, saveStatus: "unsaved" });

    await useDocumentStore.getState().saveCurrentBoard("F:\\Boards\\systems.flb");

    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
    expect(useDocumentStore.getState().fileError).toBe("disk full");
  });

  it("runs board commands through document history", () => {
    useDocumentStore.setState({
      currentBoard: createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z"),
      saveStatus: "saved"
    });

    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());

    expect(useDocumentStore.getState().currentBoard?.nodes.marker?.text).toBe("Marker");
    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["marker"]);
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");

    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.marker).toBeUndefined();
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");

    useDocumentStore.getState().redoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.marker?.text).toBe("Marker");
  });

  it("does not mark the board dirty or clear redo history for no-op commands", () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z");
    useDocumentStore.setState({
      currentBoard: board,
      saveStatus: "saved"
    });

    useDocumentStore.getState().runBoardCommand(new NoOpBoardCommand());

    expect(useDocumentStore.getState().currentBoard).toBe(board);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");

    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    useDocumentStore.getState().undoBoardCommand();
    useDocumentStore.getState().runBoardCommand(new NoOpBoardCommand());
    useDocumentStore.getState().redoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.marker?.text).toBe("Marker");
  });

  it("keeps command history after selection-only board updates", () => {
    useDocumentStore.setState({
      currentBoard: createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z"),
      saveStatus: "saved"
    });

    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    useDocumentStore.getState().selectNodes([]);
    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.marker).toBeUndefined();
  });

  it("updates selection without marking a saved board dirty", () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z");
    useDocumentStore.setState({
      currentBoard: {
        ...board,
        nodes: {
          marker: new AddMarkerNodeCommand().execute(board).nodes.marker!
        }
      },
      saveStatus: "saved"
    });

    useDocumentStore.getState().selectNodes(["marker"]);

    expect(useDocumentStore.getState().currentBoard?.selection.nodeIds).toEqual(["marker"]);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("selects edges without marking the board dirty", () => {
    useDocumentStore.setState({
      currentBoard: createBoardWithEdge("edge-1"),
      saveStatus: "saved"
    });

    useDocumentStore.getState().selectEdges(["edge-1"]);

    expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
      nodeIds: [],
      edgeIds: ["edge-1"]
    });
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("selects nodes and edges together without creating history", () => {
    useDocumentStore.setState({
      currentBoard: createBoardWithEdge("edge-1"),
      saveStatus: "saved"
    });

    useDocumentStore.getState().selectBoardItems({ nodeIds: ["source"], edgeIds: ["edge-1"] });
    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
      nodeIds: ["source"],
      edgeIds: ["edge-1"]
    });
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("does not preserve old redo history after selection on a replaced board", () => {
    useDocumentStore.setState({
      currentBoard: createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z"),
      saveStatus: "saved"
    });
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    useDocumentStore.getState().undoBoardCommand();

    useDocumentStore.setState({
      currentBoard: createBoardWithEdge("edge-1"),
      saveStatus: "saved"
    });
    useDocumentStore.getState().selectBoardItems({ nodeIds: ["source"], edgeIds: ["edge-1"] });
    useDocumentStore.getState().redoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.marker).toBeUndefined();
    expect(useDocumentStore.getState().currentBoard?.selection).toEqual({
      nodeIds: ["source"],
      edgeIds: ["edge-1"]
    });
  });

  it("resets command history when creating a new board", () => {
    useDocumentStore.setState({
      currentBoard: createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z"),
      saveStatus: "saved"
    });
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    useDocumentStore.getState().createNewBoard();

    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.id).toMatch(/^board_/);
    expect(useDocumentStore.getState().currentBoard?.nodes.marker).toBeUndefined();
  });

  it("does not apply an old command history after loading a board", async () => {
    const firstBoard = createEmptyBoardState("board-1", "2026-05-15T02:00:00.000Z");
    const loadedBoard = createEmptyBoardState("board-2", "2026-05-15T03:00:00.000Z");
    const api = {
      loadFlb: vi.fn<ElectronFileApi["loadFlb"]>().mockResolvedValue(loadedBoard),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({ currentBoard: firstBoard, saveStatus: "saved" });
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());

    await useDocumentStore.getState().loadBoard("F:\\Boards\\loaded.flb");
    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard).toEqual(loadedBoard);
  });

  it("treats board command actions as no-ops when no board is open", () => {
    expect(() => {
      useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
      useDocumentStore.getState().undoBoardCommand();
      useDocumentStore.getState().redoBoardCommand();
      useDocumentStore.getState().selectNodes(["missing"]);
    }).not.toThrow();

    expect(useDocumentStore.getState().currentBoard).toBeNull();
    expect(useDocumentStore.getState().saveStatus).toBe("unsaved");
  });

  it("deletes the current board selection through undoable history", () => {
    const board = createBoardWithEdge("edge-1");
    useDocumentStore.setState({
      currentBoard: {
        ...board,
        selection: { nodeIds: ["source"], edgeIds: [] }
      },
      saveStatus: "saved"
    });

    useDocumentStore.getState().deleteSelection();

    expect(useDocumentStore.getState().currentBoard?.nodes.source).toBeUndefined();
    expect(useDocumentStore.getState().currentBoard?.edges["edge-1"]).toBeUndefined();
    expect(useDocumentStore.getState().currentBoard?.selection).toEqual({ nodeIds: [], edgeIds: [] });
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");

    useDocumentStore.getState().undoBoardCommand();

    expect(useDocumentStore.getState().currentBoard?.nodes.source).toBeDefined();
    expect(useDocumentStore.getState().currentBoard?.edges["edge-1"]).toBeDefined();
  });

  it("copies and pastes selected nodes with their internal edges", () => {
    const board = createBoardWithEdge("edge-1");
    useDocumentStore.setState({
      currentBoard: {
        ...board,
        selection: { nodeIds: ["source", "target"], edgeIds: [] }
      },
      saveStatus: "saved"
    });

    useDocumentStore.getState().copySelection();
    useDocumentStore.getState().pasteClipboard();

    const pastedBoard = useDocumentStore.getState().currentBoard;
    expect(Object.keys(pastedBoard?.nodes ?? {})).toHaveLength(4);
    expect(Object.keys(pastedBoard?.edges ?? {})).toHaveLength(2);
    expect(pastedBoard?.selection.nodeIds).toHaveLength(2);
    expect(pastedBoard?.selection.edgeIds).toHaveLength(1);
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
  });

  it("copies incident edges when pasting a selected node", () => {
    const board = createBoardWithEdge("edge-1");
    useDocumentStore.setState({
      currentBoard: {
        ...board,
        selection: { nodeIds: ["source"], edgeIds: [] }
      },
      saveStatus: "saved"
    });

    useDocumentStore.getState().copySelection();
    useDocumentStore.getState().pasteClipboard();

    const pastedBoard = useDocumentStore.getState().currentBoard;
    const pastedEdge = Object.values(pastedBoard?.edges ?? {}).find((edge) => edge.id !== "edge-1");
    expect(Object.keys(pastedBoard?.nodes ?? {})).toHaveLength(3);
    expect(Object.keys(pastedBoard?.edges ?? {})).toHaveLength(2);
    expect(pastedBoard?.selection.nodeIds).toHaveLength(1);
    expect(pastedBoard?.selection.edgeIds).toHaveLength(1);
    expect(pastedEdge?.to).toEqual({ type: "node", nodeId: "target" });
  });

  it("saves the active named board immediately", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockResolvedValue(undefined),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      currentPath: "F:\\Boards\\systems.flb",
      saveStatus: "dirty"
    });

    await useDocumentStore.getState().saveCurrentBoardNow();

    expect(api.saveFlb).toHaveBeenCalledWith({ path: "F:\\Boards\\systems.flb", state: board });
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("keeps a named board dirty when it changes during a save", async () => {
    vi.useFakeTimers();
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    let finishSave = (): void => {};
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockReturnValue(
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
      ),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      currentPath: "F:\\Boards\\systems.flb",
      saveStatus: "dirty"
    });

    const save = useDocumentStore.getState().saveCurrentBoardNow();
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    finishSave?.();
    await save;

    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("queues named saves so an older snapshot cannot finish after a newer one", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const firstSave = deferred();
    const secondSave = deferred();
    const api = {
      saveFlb: vi
        .fn<ElectronFileApi["saveFlb"]>()
        .mockReturnValueOnce(firstSave.promise)
        .mockReturnValueOnce(secondSave.promise),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      currentPath: "F:\\Boards\\systems.flb",
      saveStatus: "dirty"
    });

    const first = useDocumentStore.getState().saveCurrentBoardNow();
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    const second = useDocumentStore.getState().saveCurrentBoardNow();

    expect(api.saveFlb).toHaveBeenCalledTimes(1);

    firstSave.resolve();
    await first;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.saveFlb).toHaveBeenCalledTimes(2);
    expect(api.saveFlb).toHaveBeenLastCalledWith({
      path: "F:\\Boards\\systems.flb",
      state: useDocumentStore.getState().currentBoard
    });

    secondSave.resolve();
    await second;

    expect(useDocumentStore.getState().saveStatus).toBe("saved");
    expect(useDocumentStore.getState().fileError).toBeNull();
  });

  it("ignores save failures from a document that is no longer current", async () => {
    const oldBoard = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const nextBoard = createEmptyBoardState("board-2", "2026-05-15T00:00:00.000Z");
    const pendingSave = deferred();
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockReturnValue(pendingSave.promise),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: oldBoard,
      currentPath: "F:\\Boards\\old.flb",
      saveStatus: "dirty"
    });

    const save = useDocumentStore.getState().saveCurrentBoardNow();
    useDocumentStore.setState({
      currentBoard: nextBoard,
      currentPath: "F:\\Boards\\next.flb",
      fileError: null,
      saveStatus: "saved"
    });
    pendingSave.reject(new Error("disk full"));
    await save;

    expect(useDocumentStore.getState().currentBoard).toBe(nextBoard);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
    expect(useDocumentStore.getState().fileError).toBeNull();
  });

  it("skips a queued named save when its document is no longer current", async () => {
    const oldBoard = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const nextBoard = createEmptyBoardState("board-2", "2026-05-15T00:00:00.000Z");
    const firstSave = deferred();
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockReturnValue(firstSave.promise),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: oldBoard,
      currentPath: "F:\\Boards\\old.flb",
      saveStatus: "dirty"
    });

    const first = useDocumentStore.getState().saveCurrentBoardNow();
    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    const queued = useDocumentStore.getState().saveCurrentBoardNow();
    useDocumentStore.setState({
      currentBoard: nextBoard,
      currentPath: "F:\\Boards\\next.flb",
      fileError: null,
      saveStatus: "saved"
    });

    firstSave.resolve();
    await first;
    await queued;

    expect(api.saveFlb).toHaveBeenCalledTimes(1);
    expect(useDocumentStore.getState().currentBoard).toBe(nextBoard);
    expect(useDocumentStore.getState().currentPath).toBe("F:\\Boards\\next.flb");
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("uses save-as for an unnamed active board", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlbAs: vi.fn<ElectronFileApi["saveFlbAs"]>().mockResolvedValue({
        canceled: false,
        path: "F:\\Boards\\systems.flb"
      }),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([
        { path: "F:\\Boards\\systems.flb", title: "Systems", openedAt: "2026-05-15T00:00:00.000Z" }
      ])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      saveStatus: "dirty"
    });

    await useDocumentStore.getState().saveCurrentBoardNow();

    expect(api.saveFlbAs).toHaveBeenCalledWith(board);
    expect(useDocumentStore.getState().currentPath).toBe("F:\\Boards\\systems.flb");
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
    expect(useDocumentStore.getState().recentFiles).toEqual([
      { path: "F:\\Boards\\systems.flb", title: "Systems", openedAt: "2026-05-15T00:00:00.000Z" }
    ]);
  });

  it("preserves the dirty status when unnamed save-as is canceled", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlbAs: vi.fn<ElectronFileApi["saveFlbAs"]>().mockResolvedValue({ canceled: true })
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      saveStatus: "dirty"
    });

    await useDocumentStore.getState().saveCurrentBoardNow();

    expect(useDocumentStore.getState().currentPath).toBeNull();
    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
  });

  it("debounces auto-save for dirty named boards", async () => {
    vi.useFakeTimers();
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockResolvedValue(undefined),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      currentBoard: board,
      currentPath: "F:\\Boards\\systems.flb",
      saveStatus: "saved"
    });

    useDocumentStore.getState().runBoardCommand(new AddMarkerNodeCommand());
    expect(api.saveFlb).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(800);

    expect(api.saveFlb).toHaveBeenCalledTimes(1);
  });

  it("removes a broken recent file from the list", async () => {
    const api = {
      removeRecentFile: vi.fn<ElectronFileApi["removeRecentFile"]>().mockResolvedValue([
        { path: "F:\\Boards\\kept.flb", title: "Kept", openedAt: "2026-05-15T00:00:00.000Z" }
      ])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({
      recentFiles: [
        { path: "F:\\Boards\\missing.flb", title: "Missing", openedAt: "2026-05-15T00:00:00.000Z" },
        { path: "F:\\Boards\\kept.flb", title: "Kept", openedAt: "2026-05-15T00:00:00.000Z" }
      ]
    });

    await useDocumentStore.getState().removeRecentFile("F:\\Boards\\missing.flb");

    expect(api.removeRecentFile).toHaveBeenCalledWith("F:\\Boards\\missing.flb");
    expect(useDocumentStore.getState().recentFiles).toEqual([
      { path: "F:\\Boards\\kept.flb", title: "Kept", openedAt: "2026-05-15T00:00:00.000Z" }
    ]);
  });
});
