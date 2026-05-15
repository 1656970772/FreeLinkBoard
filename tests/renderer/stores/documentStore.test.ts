import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardCommand } from "../../../src/application/commands/BoardCommand";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";
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
