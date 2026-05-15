import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("documentStore", () => {
  beforeEach(() => {
    resetStore();
    Reflect.deleteProperty(window, "freeLinkBoard");
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
});
